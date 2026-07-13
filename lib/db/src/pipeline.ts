import { spawn } from "node:child_process";
import type { Pool } from "pg";
import { buildTenantAiEnv } from "./ai-settings";

// Shared orchestration for the incremental data-refresh pipeline. Both the
// dashboard "Atualizar" button (via the API server) and the 6-hourly automation
// call this, so the order and resilience are defined exactly once here.
//
// The pipeline is the same set of incremental/idempotent jobs the manual
// `refresh-all` script has always run, in order:
//   1. classify only NOT-yet-enriched messages (cheap provider)
//   2. upsert DM contacts + refresh cached msg_count
//   3. rebuild pautas/topics from enriched messages
//   4. accumulate new mentions of monitored entities
// One failing job does NOT abort the rest; the run is marked failed if any job
// exits non-zero, but every job still gets a chance.
//
// Concurrency is enforced at the DB level (refresh_runs partial unique index on
// status='running' per tenant): startRefreshRun refuses to start a second cycle
// while one is in flight, so repeated clicks or manual+scheduled overlap never
// double-spend AI budget.

export type RefreshStatus = "running" | "completed" | "failed";
export type RefreshTrigger = "manual" | "scheduled" | "webhook" | "quick";

export interface RefreshJobResult {
  label: string;
  script: string;
  code: number;
}

export interface RefreshRun {
  id: string;
  tenantId: string;
  status: RefreshStatus;
  trigger: RefreshTrigger;
  startedAt: string;
  finishedAt: string | null;
  jobs: RefreshJobResult[] | null;
  error: string | null;
}

// Thrown by startRefreshRun when a cycle is already running for the tenant.
export class RefreshAlreadyRunningError extends Error {
  run: RefreshRun | null;
  constructor(run: RefreshRun | null) {
    super("refresh já em andamento");
    this.name = "RefreshAlreadyRunningError";
    this.run = run;
  }
}

interface Job {
  label: string;
  script: string;
  env?: Record<string, string>;
}

const CLASSIFY_JOB_ENV: Record<string, string> = {
  CLASSIFY_PROVIDER: process.env.CLASSIFY_PROVIDER ?? "openrouter",
  CONCURRENCY: process.env.CONCURRENCY ?? "6",
  BATCH_SIZE: process.env.BATCH_SIZE ?? "15",
  PAGE: process.env.PAGE ?? "900",
};

const MENTIONS_JOB_ENV: Record<string, string> = {
  MENTION_SAMPLE: process.env.MENTION_SAMPLE ?? "500",
  MENTION_RECENT_HOURS: process.env.MENTION_RECENT_HOURS ?? "72",
};

// Full pipeline — manual button + 6h scheduler.
export const FULL_REFRESH_JOBS: Job[] = [
  { label: "Classificar mensagens novas", script: "backfill-text-full", env: CLASSIFY_JOB_ENV },
  { label: "Transcrever áudios", script: "backfill-audio-transcription" },
  { label: "Normalizar tipos de mídia", script: "backfill-raw-type" },
  { label: "Atualizar contatos (CRM + volume)", script: "backfill-contacts" },
  { label: "Sincronizar nomes de grupos", script: "sync-group-names" },
  { label: "Sincronizar tasks automáticas", script: "sync-tasks-from-enrichment" },
  { label: "Sincronizar itens salvos", script: "sync-saved-from-enrichment" },
  { label: "Reconstruir pautas / tópicos", script: "build-topics" },
  { label: "Detectar menções", script: "build-mentions", env: MENTIONS_JOB_ENV },
];

// Lighter cycle after Evolution webhook — skips expensive topic rebuild.
export const INCREMENTAL_REFRESH_JOBS: Job[] = [
  {
    label: "Classificar mensagens novas",
    script: "backfill-text-full",
    env: {
      ...CLASSIFY_JOB_ENV,
      PAGE: "120",
      MAX_MESSAGES: process.env.INCREMENTAL_MAX_MESSAGES ?? "80",
    },
  },
  {
    label: "Transcrever áudios",
    script: "backfill-audio-transcription",
    env: { MAX_MESSAGES: process.env.INCREMENTAL_AUDIO_MAX ?? "8" },
  },
  { label: "Normalizar tipos de mídia", script: "backfill-raw-type" },
  { label: "Atualizar contatos (CRM + volume)", script: "backfill-contacts" },
  { label: "Sincronizar tasks automáticas", script: "sync-tasks-from-enrichment" },
  { label: "Sincronizar itens salvos", script: "sync-saved-from-enrichment" },
  {
    label: "Detectar menções",
    script: "build-mentions",
    env: {
      MENTION_SAMPLE: process.env.INCREMENTAL_MENTION_SAMPLE ?? "300",
      MENTION_RECENT_HOURS: process.env.MENTION_RECENT_HOURS ?? "72",
    },
  },
];

// Same jobs (and cheap-provider defaults) the standalone refresh-all script
// used, kept here so the API and the scheduler share one definition.
const JOBS: Job[] = FULL_REFRESH_JOBS;

// A running cycle older than this is assumed dead (process crashed before it
// could finalize) and is reclaimed so the lock never wedges forever.
const DEFAULT_STALE_SECONDS = 2 * 60 * 60; // 2h

interface DbRow {
  id: string;
  tenant_id: string;
  status: RefreshStatus;
  trigger: RefreshTrigger;
  started_at: Date | string;
  finished_at: Date | string | null;
  jobs: RefreshJobResult[] | null;
  error: string | null;
}

function toIso(v: Date | string | null): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapRow(r: DbRow): RefreshRun {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    status: r.status,
    trigger: r.trigger,
    startedAt: toIso(r.started_at) ?? new Date().toISOString(),
    finishedAt: toIso(r.finished_at),
    jobs: r.jobs ?? null,
    error: r.error,
  };
}

export async function getLatestRefreshRun(
  pool: Pool,
  tenantId: string,
): Promise<RefreshRun | null> {
  const { rows } = await pool.query<DbRow>(
    `select * from refresh_runs
      where tenant_id = $1
      order by started_at desc
      limit 1`,
    [tenantId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function getRunningRun(
  pool: Pool,
  tenantId: string,
): Promise<RefreshRun | null> {
  const { rows } = await pool.query<DbRow>(
    `select * from refresh_runs
      where tenant_id = $1 and status = 'running'
      order by started_at desc
      limit 1`,
    [tenantId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Inserts a 'running' row, enforcing the one-cycle-per-tenant lock. Reclaims a
// stale running row first (crashed prior run). Throws RefreshAlreadyRunningError
// when a genuine cycle is already in flight.
export async function startRefreshRun(
  pool: Pool,
  opts: {
    tenantId: string;
    trigger: RefreshTrigger;
    staleSeconds?: number;
  },
): Promise<RefreshRun> {
  const { tenantId, trigger } = opts;
  const staleSeconds = opts.staleSeconds ?? DEFAULT_STALE_SECONDS;

  await pool.query(
    `update refresh_runs
        set status = 'failed',
            finished_at = now(),
            error = coalesce(error, 'expirado (timeout)')
      where tenant_id = $1
        and status = 'running'
        and started_at < now() - make_interval(secs => $2::int)`,
    [tenantId, staleSeconds],
  );

  try {
    const { rows } = await pool.query<DbRow>(
      `insert into refresh_runs (tenant_id, status, trigger)
       values ($1, 'running', $2)
       returning *`,
      [tenantId, trigger],
    );
    return mapRow(rows[0]!);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      throw new RefreshAlreadyRunningError(await getRunningRun(pool, tenantId));
    }
    throw e;
  }
}

function spawnJob(job: Job): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@workspace/scripts", "run", job.script],
      { stdio: "inherit", env: { ...process.env, ...job.env } },
    );
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`spawn error (${job.script}): ${err.message}`);
      resolve(1);
    });
  });
}

// Runs the pipeline jobs in order for an already-started run, then finalizes the
// run row (completed/failed + per-job results). Never throws for job failures;
// only an unexpected orchestration error rejects (after marking the run failed).
export async function executeRefreshRun(
  pool: Pool,
  run: RefreshRun,
  opts?: { jobs?: Job[] },
): Promise<RefreshRun> {
  const jobs = opts?.jobs ?? JOBS;
  try {
    const tenantAiEnv = await buildTenantAiEnv(pool, run.tenantId);
    const results: RefreshJobResult[] = [];
    for (const job of jobs) {
      const code = await spawnJob({ ...job, env: { ...tenantAiEnv, ...job.env } });
      results.push({ label: job.label, script: job.script, code });
    }
    const failed = results.filter((r) => r.code !== 0);
    const status: RefreshStatus = failed.length > 0 ? "failed" : "completed";
    const error =
      failed.length > 0
        ? `${failed.length} etapa(s) falharam: ${failed.map((f) => f.label).join(", ")}`
        : null;
    const { rows } = await pool.query<DbRow>(
      `update refresh_runs
          set status = $2, finished_at = now(), jobs = $3::jsonb, error = $4
        where id = $1
        returning *`,
      [run.id, status, JSON.stringify(results), error],
    );
    return rows[0] ? mapRow(rows[0]) : { ...run, status, error };
  } catch (e) {
    const message = (e as Error).message;
    await pool
      .query(
        `update refresh_runs
            set status = 'failed', finished_at = now(), error = $2
          where id = $1`,
        [run.id, message],
      )
      .catch(() => {});
    throw e;
  }
}
