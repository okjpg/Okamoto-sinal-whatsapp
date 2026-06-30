import { pool, type RefreshRun } from "@workspace/db";
import { OWNER } from "./scope";

export interface RefreshAlertSummary {
  pendingUnanswered: number;
  openTasks: number;
  mentionsLast24h: number;
  expiredSnoozes: number;
}

export async function collectRefreshAlertSummary(
  tenantId: string,
): Promise<RefreshAlertSummary> {
  if (!OWNER) {
    return {
      pendingUnanswered: 0,
      openTasks: 0,
      mentionsLast24h: 0,
      expiredSnoozes: 0,
    };
  }

  const [pending, tasks, mentions, snoozes] = await Promise.all([
    pool.query<{ n: string }>(
      `with last_msg as (
         select distinct on (coalesce(nullif(chat_id,''), contact_phone))
                coalesce(nullif(chat_id,''), contact_phone) as phone,
                direction,
                message_id
           from whatsapp_messages
          where whatsapp_owner = $1 and chat_type = 'private'
            and coalesce(nullif(chat_id,''), contact_phone) is not null
          order by coalesce(nullif(chat_id,''), contact_phone), message_created_at desc
       )
       select count(*)::int as n
         from last_msg l
         join message_enrichment e on e.message_id = l.message_id
        where l.direction = 'inbound'
          and e.requires_reply is true
          and not exists (
            select 1 from pending_dismissals d
             where d.tenant_id = $2 and d.chat_id = l.phone
               and (d.snooze_until is null or d.snooze_until > now())
          )`,
      [OWNER, tenantId],
    ),
    pool.query<{ n: string }>(
      `select count(*)::int as n from tasks
        where tenant_id = $1 and done = false`,
      [tenantId],
    ),
    pool.query<{ n: string }>(
      `select count(*)::int as n from mentions
        where tenant_id = $1
          and created_at >= now() - interval '24 hours'`,
      [tenantId],
    ),
    pool.query<{ n: string }>(
      `select count(*)::int as n
         from pending_dismissals d
        where d.tenant_id = $1
          and d.snooze_until is not null
          and d.snooze_until <= now()
          and d.snooze_until >= now() - interval '2 hours'`,
      [tenantId],
    ),
  ]);

  return {
    pendingUnanswered: Number(pending.rows[0]?.n ?? 0),
    openTasks: Number(tasks.rows[0]?.n ?? 0),
    mentionsLast24h: Number(mentions.rows[0]?.n ?? 0),
    expiredSnoozes: Number(snoozes.rows[0]?.n ?? 0),
  };
}

export async function sendRefreshAlerts(
  tenantId: string,
  run: RefreshRun,
): Promise<void> {
  const url = process.env.SINAL_ALERT_WEBHOOK_URL?.trim();
  if (!url || run.status !== "completed") return;

  const summary = await collectRefreshAlertSummary(tenantId);

  const actionable =
    summary.pendingUnanswered > 0 ||
    summary.openTasks > 0 ||
    summary.mentionsLast24h > 0 ||
    summary.expiredSnoozes > 0;

  if (!actionable && process.env.SINAL_ALERT_WEBHOOK_ALWAYS !== "1") return;

  const payload = {
    source: "sinal",
    event: "refresh_completed",
    trigger: run.trigger,
    runId: run.id,
    finishedAt: run.finishedAt,
    summary,
    message: [
      summary.pendingUnanswered > 0
        ? `${summary.pendingUnanswered} DM(s) sem resposta`
        : null,
      summary.openTasks > 0 ? `${summary.openTasks} task(s) aberta(s)` : null,
      summary.mentionsLast24h > 0
        ? `${summary.mentionsLast24h} menção(ões) nas últimas 24h`
        : null,
      summary.expiredSnoozes > 0
        ? `${summary.expiredSnoozes} snooze(s) expirado(s)`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      console.warn(`SINAL_ALERT_WEBHOOK_URL returned ${r.status}`);
    }
  } catch (e) {
    console.warn(`alert webhook failed: ${(e as Error).message}`);
  }
}

export interface RefreshLiveStats {
  lastMessageAt: string | null;
  lastRefreshAt: string | null;
  refreshRunning: boolean;
  pendingUnanswered: number;
  openTasks: number;
  mentionsLast24h: number;
  expiredSnoozes: number;
  unenrichedRecent: number;
}

export async function getRefreshLiveStats(
  tenantId: string,
  latestRun: RefreshRun | null,
): Promise<RefreshLiveStats> {
  const summary = await collectRefreshAlertSummary(tenantId);

  let lastMessageAt: string | null = null;
  let unenrichedRecent = 0;

  if (OWNER) {
    const msg = await pool.query<{ last_at: Date | null; unenriched: string }>(
      `select max(message_created_at) as last_at,
              count(*) filter (
                where message_created_at >= now() - interval '24 hours'
                  and not exists (
                    select 1 from message_enrichment e where e.message_id = m.message_id
                  )
              )::int as unenriched
         from whatsapp_messages m
        where m.whatsapp_owner = $1`,
      [OWNER],
    );
    lastMessageAt = msg.rows[0]?.last_at
      ? new Date(msg.rows[0].last_at).toISOString()
      : null;
    unenrichedRecent = Number(msg.rows[0]?.unenriched ?? 0);
  }

  return {
    lastMessageAt,
    lastRefreshAt:
      latestRun && latestRun.status !== "running"
        ? latestRun.finishedAt
        : latestRun?.startedAt ?? null,
    refreshRunning: latestRun?.status === "running",
    ...summary,
    unenrichedRecent,
  };
}
