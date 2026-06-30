import {
  pool,
  MVP_TENANT_ID,
  startRefreshRun,
  executeRefreshRun,
  INCREMENTAL_REFRESH_JOBS,
  RefreshAlreadyRunningError,
  type RefreshRun,
} from "@workspace/db";
import { logger } from "./logger";
import { sendRefreshAlerts } from "./refresh-alerts";

const DEBOUNCE_MS = Number(process.env.WEBHOOK_REFRESH_DEBOUNCE_MS) || 30_000;
const RETRY_MS = Number(process.env.WEBHOOK_REFRESH_RETRY_MS) || 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pending = false;

async function runIncrementalRefresh(
  tenantId: string,
  trigger: "webhook" | "quick",
): Promise<RefreshRun | null> {
  try {
    const run = await startRefreshRun(pool, { tenantId, trigger });
    logger.info({ runId: run.id, trigger }, "incremental refresh started");
    const done = await executeRefreshRun(pool, run, {
      jobs: INCREMENTAL_REFRESH_JOBS,
    });
    await sendRefreshAlerts(tenantId, done);
    logger.info(
      { runId: done.id, status: done.status, trigger },
      "incremental refresh finished",
    );
    return done;
  } catch (e) {
    if (e instanceof RefreshAlreadyRunningError) {
      logger.info({ trigger }, "incremental refresh deferred — cycle already running");
      return null;
    }
    logger.error({ err: e, trigger }, "incremental refresh failed");
    throw e;
  }
}

function scheduleRetry(tenantId: string): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runIncrementalRefresh(tenantId, "webhook").catch(() => {});
  }, RETRY_MS);
  retryTimer.unref?.();
}

async function flushWebhookRefresh(tenantId: string): Promise<void> {
  if (!pending) return;
  pending = false;
  debounceTimer = null;
  const done = await runIncrementalRefresh(tenantId, "webhook");
  if (!done) scheduleRetry(tenantId);
}

/** Debounced incremental refresh after Evolution inserts new messages. */
export function scheduleWebhookRefresh(
  tenantId: string = MVP_TENANT_ID,
): void {
  pending = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void flushWebhookRefresh(tenantId);
  }, DEBOUNCE_MS);
  debounceTimer.unref?.();
}

/** Start incremental refresh in background; returns the running cycle row. */
export async function startQuickRefresh(
  tenantId: string,
): Promise<RefreshRun> {
  const run = await startRefreshRun(pool, { tenantId, trigger: "quick" });
  void executeRefreshRun(pool, run, { jobs: INCREMENTAL_REFRESH_JOBS })
    .then((done) => sendRefreshAlerts(tenantId, done))
    .catch((err) => {
      logger.error({ err }, "quick refresh pipeline failed");
    });
  return run;
}
