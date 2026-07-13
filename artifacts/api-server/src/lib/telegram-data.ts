import { pool, MVP_TENANT_ID, getLatestRefreshRun } from "@workspace/db";
import { OWNER } from "./scope";
import {
  collectRefreshAlertSummary,
  getRefreshLiveStats,
} from "./refresh-alerts";
import {
  getDefaultWhatsAppConnectionStatus,
  type MessageMirror,
  type WhatsAppConnectionStatus,
} from "./whatsapp-connection";

export interface Overview7d {
  received: number;
  sent: number;
  groups: number;
  totalMessages: number;
}

const WORK_TZ = process.env.RESPONSE_TIME_TZ ?? "America/Sao_Paulo";

export interface PendingDm {
  chat_id: string;
  name: string | null;
  summary: string | null;
  category: string | null;
  last_at: Date | null;
  open_tasks: number;
}

export interface MentionRow {
  entity_name: string;
  mention_type: string | null;
  sentiment: string | null;
  text: string | null;
  chat_name: string | null;
  created_at: Date;
}

export interface TaskRow {
  title: string;
  contact_name: string | null;
  due_at: Date | null;
  direction: string | null;
}

export interface VolumeTrend {
  current: number;
  previous: number;
  pctChange: number;
}

export interface WhatsAppMessageMirror extends MessageMirror {}

export type WhatsAppConnectionInfo = WhatsAppConnectionStatus & {
  label: string;
  ownerPhoneFormatted: string;
  suggestedInstance: string | null;
};

export interface EnrichedDigestContext {
  tenantId: string;
  appUrl: string;
  latestRun: Awaited<ReturnType<typeof getLatestRefreshRun>>;
  summary: Awaited<ReturnType<typeof collectRefreshAlertSummary>>;
  live: Awaited<ReturnType<typeof getRefreshLiveStats>>;
  overview: Overview7d;
  tasks: TaskRow[];
  mentions: MentionRow[];
  pendingDms: PendingDm[];
  volumeTrend: VolumeTrend;
  whatsapp: WhatsAppConnectionInfo;
}

export function resolveAppUrl(appUrl?: string | null): string {
  return (
    appUrl?.trim() ||
    process.env.SINAL_PUBLIC_URL?.trim() ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
}

async function collectOverview7d(): Promise<Overview7d> {
  if (!OWNER) {
    return { received: 0, sent: 0, groups: 0, totalMessages: 0 };
  }
  const { rows } = await pool.query<{
    received: number;
    sent: number;
    groups: number;
    total: number;
  }>(
    `select
        count(*) filter (where chat_type = 'private' and direction = 'inbound')::int as received,
        count(*) filter (where chat_type = 'private' and direction = 'outbound')::int as sent,
        count(distinct chat_id) filter (where chat_type = 'group')::int as groups,
        count(*)::int as total
       from whatsapp_messages
      where whatsapp_owner = $1
        and message_created_at >= now() - interval '7 days'`,
    [OWNER],
  );
  const r = rows[0];
  return {
    received: r?.received ?? 0,
    sent: r?.sent ?? 0,
    groups: r?.groups ?? 0,
    totalMessages: r?.total ?? 0,
  };
}

async function collectVolumeTrend(days = 7): Promise<VolumeTrend> {
  if (!OWNER) return { current: 0, previous: 0, pctChange: 0 };
  const { rows } = await pool.query<{ current: number; previous: number }>(
    `select
        count(*) filter (
          where message_created_at >= now() - ($2 || ' days')::interval
        )::int as current,
        count(*) filter (
          where message_created_at >= now() - (($2::int * 2) || ' days')::interval
            and message_created_at < now() - ($2 || ' days')::interval
        )::int as previous
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private' and direction = 'inbound'`,
    [OWNER, String(days)],
  );
  const current = rows[0]?.current ?? 0;
  const previous = rows[0]?.previous ?? 0;
  const pctChange =
    previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0
        ? 100
        : 0;
  return { current, previous, pctChange };
}

async function collectPendingDms(tenantId: string, limit = 5): Promise<PendingDm[]> {
  if (!OWNER) return [];
  const { rows } = await pool.query<{
    chat_id: string;
    name: string | null;
    summary: string | null;
    category: string | null;
    last_at: Date | null;
    open_tasks: number;
  }>(
    `with src as (
       select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as phone,
              message_id, message_created_at, direction,
              coalesce(nullif(chat_name,''), sender_name) as name,
              coalesce(nullif(message,''), caption, transcription) as text
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private'
          and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
          and message_created_at >= now() - interval '30 days'
     ),
     last_msg as (
       select distinct on (phone)
              phone, message_id, message_created_at, direction, name, text
         from src
        order by phone, message_created_at desc
     )
     select l.phone as chat_id, l.name,
            coalesce(e.summary, l.text) as summary,
            e.category, l.message_created_at as last_at,
            coalesce(tk.open_tasks, 0)::int as open_tasks
       from last_msg l
       join message_enrichment e on e.message_id = l.message_id
       left join lateral (
         select count(*)::int as open_tasks
           from contacts c
           join tasks t on t.contact_id = c.id and t.tenant_id = $2 and t.done = false
          where c.tenant_id = $2 and c.primary_phone = l.phone
       ) tk on true
      where l.direction = 'inbound'
        and e.requires_reply is true
        and not exists (
          select 1 from pending_dismissals d
           where d.tenant_id = $2 and d.chat_id = l.phone
             and (d.snooze_until is null or d.snooze_until > now())
        )
      order by l.message_created_at desc
      limit $3`,
    [OWNER, tenantId, limit],
  );
  return rows;
}

async function collectOpenTasks(tenantId: string, limit = 8): Promise<TaskRow[]> {
  const { rows } = await pool.query<TaskRow>(
    `select t.title, c.display_name as contact_name, t.due_at, t.direction
       from tasks t
       left join contacts c on c.id = t.contact_id
      where t.tenant_id = $1 and t.done = false
      order by t.due_at nulls last, t.created_at desc
      limit $2`,
    [tenantId, limit],
  );
  return rows;
}

async function collectRecentMentions(tenantId: string, limit = 5): Promise<MentionRow[]> {
  if (!OWNER) return [];
  const { rows } = await pool.query<MentionRow>(
    `select e.name as entity_name, mn.mention_type, mn.sentiment,
            coalesce(nullif(m.message,''), m.caption, m.transcription) as text,
            m.chat_name, mn.created_at
       from mentions mn
       join monitored_entities e on e.id = mn.entity_id
       left join whatsapp_messages m on m.message_id = mn.message_id
            and m.whatsapp_owner = $2
      where mn.tenant_id = $1
        and mn.created_at >= now() - interval '48 hours'
      order by mn.created_at desc
      limit $3`,
    [tenantId, OWNER, limit],
  );
  return rows;
}

async function collectWhatsAppConnection(): Promise<WhatsAppConnectionInfo> {
  const raw = await getDefaultWhatsAppConnectionStatus();
  const profile = raw.instanceDetails?.profileName;
  const label = raw.connected
    ? profile
      ? `Conectado · ${profile}`
      : "WhatsApp conectado"
    : raw.state === "connecting"
      ? "Aguardando QR no celular"
      : raw.instanceDetails?.disconnectionMessage
        ? `Desconectado · ${raw.instanceDetails.disconnectionMessage}`
        : !raw.configured
          ? "Evolution não configurado"
          : raw.state === "error"
            ? "Evolution indisponível"
            : "WhatsApp desconectado";

  return {
    ...raw,
    label,
    ownerPhoneFormatted: raw.ownerPhone,
    suggestedInstance: raw.suggestedInstanceName,
  };
}

export async function loadEnrichedContext(
  tenantId: string = MVP_TENANT_ID,
  appUrl?: string | null,
): Promise<EnrichedDigestContext> {
  const latestRun = await getLatestRefreshRun(pool, tenantId);
  const [
    summary,
    live,
    overview,
    tasks,
    mentions,
    pendingDms,
    volumeTrend,
    whatsapp,
  ] = await Promise.all([
    collectRefreshAlertSummary(tenantId),
    getRefreshLiveStats(tenantId, latestRun),
    collectOverview7d(),
    collectOpenTasks(tenantId),
    collectRecentMentions(tenantId),
    collectPendingDms(tenantId),
    collectVolumeTrend(),
    collectWhatsAppConnection(),
  ]);
  return {
    tenantId,
    appUrl: resolveAppUrl(appUrl),
    latestRun,
    summary,
    live,
    overview,
    tasks,
    mentions,
    pendingDms,
    volumeTrend,
    whatsapp,
  };
}

export function fmtTimeAgo(iso: string | Date | null): string {
  if (!iso) return "sem registro";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

export function fmtDateBr(d = new Date()): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: WORK_TZ,
  });
}

export function fmtTimeBr(d = new Date()): string {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: WORK_TZ,
  });
}

export function fmtDue(due: Date | null): string {
  if (!due) return "";
  const d = new Date(due);
  const today = new Date();
  const sameDay =
    d.toLocaleDateString("pt-BR", { timeZone: WORK_TZ }) ===
    today.toLocaleDateString("pt-BR", { timeZone: WORK_TZ });
  if (sameDay) {
    return `vence hoje ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: WORK_TZ })}`;
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: WORK_TZ,
  });
}
