import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { TOPIC_BLACKLIST, GROUP_TOPIC_BLACKLIST } from "@workspace/ai";
import { OWNER, requireOwnerTenant, excludeSupportGroupsSql } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);
// whatsapp_messages has no tenant_id; this gate ensures only the WhatsApp
// owner's tenant can reach these metrics, enforcing tenant isolation alongside
// the per-query owner + tenant_id filters below.
router.use(requireOwnerTenant);

function tenant(req: AuthedRequest): string {
  return req.auth!.tenantId;
}

// Parse a ?days= query param defensively: fall back to `fallback` on
// NaN/missing, floor to >= 1, and cap at 365.
function parseDays(raw: unknown, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

// Working window used by the response-time KPI so the average is not skewed by
// overnight/weekend gaps. Latency is measured as the *business minutes* that
// elapse between an inbound message and the next reply — time outside the
// window (and on weekends) is ignored. Configurable via env; defaults to
// 08:00–20:00, Mon–Fri, in São Paulo local time.
const WORK_TZ = process.env.RESPONSE_TIME_TZ ?? "America/Sao_Paulo";
function parseHour(raw: string | undefined, fallback: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 24) return fallback;
  return n;
}
const WORK_START_HOUR = parseHour(process.env.RESPONSE_TIME_START_HOUR, 8);
const WORK_END_HOUR = parseHour(process.env.RESPONSE_TIME_END_HOUR, 20);

// Category distribution (DM only). Period-aware via join to the source table.
router.get("/metrics/private/categories", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const { rows } = await pool.query(
    `select coalesce(e.category,'(sem)') as category, count(*)::int as count
       from message_enrichment e
       join whatsapp_messages m on m.message_id = e.message_id
        and m.whatsapp_owner = $2
      where e.tenant_id = $1 and e.chat_type = 'private'
        and m.message_created_at >= now() - ($3 || ' days')::interval
      group by e.category order by count desc`,
    [tenant(req), OWNER, String(days)],
  );
  res.json({ categories: rows });
});

// Sentiment distribution (DM only).
router.get("/metrics/private/sentiment", async (req: AuthedRequest, res) => {
  const { rows } = await pool.query(
    `select coalesce(sentiment,'(sem)') as sentiment, count(*)::int as count
       from message_enrichment
      where tenant_id = $1 and chat_type = 'private'
      group by sentiment order by count desc`,
    [tenant(req)],
  );
  res.json({ sentiment: rows });
});

// Daily volume of private messages (received vs sent), last N days.
router.get("/metrics/private/volume", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 90);
  const { rows } = await pool.query(
    `select to_char(date_trunc('day', message_created_at), 'YYYY-MM-DD') as day,
            count(*) filter (where direction = 'inbound')::int as received,
            count(*) filter (where direction = 'outbound')::int as sent
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and message_created_at >= now() - ($2 || ' days')::interval
      group by 1 order by 1`,
    [OWNER, String(days)],
  );
  res.json({ volume: rows });
});

// Top contacts by private message volume. Keyed by the *effective* DM phone
// coalesce(nullif(chat_id,''), nullif(contact_phone,'')) — the same expression
// the Contatos list uses — so a DM that only carries contact_phone (empty
// chat_id) is still attributed to the right contact and the totals match.
router.get("/metrics/private/top-contacts", async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const { rows } = await pool.query(
    `select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as phone,
            max(coalesce(nullif(chat_name,''), nullif(sender_name,''))) as name,
            count(*)::int as messages,
            count(*) filter (where direction = 'inbound')::int as received,
            count(*) filter (where direction = 'outbound')::int as sent,
            max(message_created_at) as last_at
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
      group by 1
      order by messages desc
      limit $2`,
    [OWNER, limit],
  );
  res.json({ contacts: rows });
});

// Trending topics (pautas) over the last N days, from enriched topics array.
router.get("/metrics/private/trending", async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 15), 50);
  const { rows } = await pool.query(
    `select topic, count(*)::int as count
       from (
         select unnest(e.topics) as topic
           from message_enrichment e
          where e.tenant_id = $1 and e.chat_type = 'private'
            and e.topics is not null
       ) t
      where topic is not null and length(trim(topic)) > 0
      group by topic order by count desc limit $2`,
    [tenant(req), limit],
  );
  res.json({ trending: rows });
});

// Unanswered queue: latest message per private contact is inbound & requires
// reply. Contacts are keyed by the *effective* DM phone
// coalesce(nullif(chat_id,''), nullif(contact_phone,'')) (same as Contatos) so
// DMs carrying only contact_phone are not dropped.
router.get("/metrics/private/unanswered", async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const { rows } = await pool.query(
    `with src as (
       select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as phone,
              message_id, message_created_at, direction, chat_name, sender_name,
              message, caption, transcription
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private'
          and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
     ),
     last_msg as (
       select distinct on (phone)
              phone, message_id, message_created_at, direction,
              coalesce(nullif(chat_name,''), sender_name) as name,
              coalesce(nullif(message,''), caption, transcription) as text
         from src
        order by phone, message_created_at desc
     )
     select l.phone, l.name, l.text, l.message_created_at as last_at,
            e.category, e.summary, e.requires_reply
       from last_msg l
       left join message_enrichment e on e.message_id = l.message_id
      where l.direction = 'inbound'
        and e.requires_reply is true
      order by l.message_created_at desc
      limit $2`,
    [OWNER, limit],
  );
  res.json({ unanswered: rows });
});

// Group pendencies: inbound questions / requires_reply with no owner reply yet.
router.get("/metrics/groups/unanswered", async (req: AuthedRequest, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const t = tenant(req);
  const params: unknown[] = [OWNER];
  const tenantIdx = params.push(t);
  const supportClause = excludeSupportGroupsSql("m", t, params);
  const limitIdx = params.push(limit);
  const { rows } = await pool.query(
    `select m.chat_id, m.chat_name,
            coalesce(nullif(m.sender_name,''), m.chat_name) as name,
            coalesce(nullif(m.message,''), m.caption, m.transcription, e.summary) as text,
            e.summary, e.is_question, e.requires_reply,
            m.message_created_at as last_at, m.message_id
       from message_enrichment e
       join whatsapp_messages m
         on m.message_id = e.message_id and m.whatsapp_owner = $1
      where e.tenant_id = $${tenantIdx}
        and e.chat_type = 'group'
        and m.direction = 'inbound'
        and (e.requires_reply is true or e.is_question is true)
        and not exists (
          select 1 from whatsapp_messages r
           where r.whatsapp_owner = $1
             and r.chat_id = m.chat_id
             and r.direction = 'outbound'
             and r.message_created_at > m.message_created_at
        )${supportClause}
      order by m.message_created_at desc
      limit $${limitIdx}`,
    params,
  );
  res.json({ unanswered: rows });
});

// Invites & opportunities block (convite / oportunidade/parceria).
// Deduped to ONE entry per contact (DM partner, keyed by the effective DM phone:
// coalesce(nullif(chat_id,''), nullif(contact_phone,''))), aggregating that
// person's invite messages. Each entry carries the direction of the most recent
// invite message (inbound = recebido de / outbound = enviado para), the number of
// invite messages grouped, and the persisted triage status from invite_triage
// (defaults to 'aberto' when never triaged). DMs usually key on chat_id, but some
// rows only carry contact_phone, so the effective-phone fallback keeps those too;
// the partner name comes from chat_name/sender_name.
router.get("/metrics/private/invites", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const { rows } = await pool.query(
    `with src as (
       select e.message_id, e.category, e.summary, e.topics, m.direction,
              coalesce(nullif(m.chat_name,''), nullif(m.sender_name,'')) as name,
              coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) as phone,
              m.message_created_at as at,
              coalesce(nullif(m.message,''), m.caption, m.transcription) as text
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
          and m.whatsapp_owner = $2
        where e.tenant_id = $1 and e.chat_type = 'private'
          and (
            e.category in ('convite','oportunidade/parceria')
            or (e.category in ('networking', 'suporte/dúvida') and e.requires_reply is true)
          )
          and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) is not null
          and m.message_created_at >= now() - ($3 || ' days')::interval
     ),
     invites as (
       select message_id, category, summary, topics, direction, name, phone, at, text,
              row_number() over (
                partition by phone order by at desc
              ) as rn,
              count(*) over (partition by phone)::int as message_count
         from src
     )
     select i.message_id, i.category, i.summary, i.topics, i.direction,
            i.name, i.phone, i.at, i.text, i.message_count,
            coalesce(t.status, 'aberto') as status,
            t.contact_id
       from invites i
       left join invite_triage t
         on t.tenant_id = $1 and t.chat_id = i.phone
      where i.rn = 1
      order by i.at desc`,
    [tenant(req), OWNER, String(days)],
  );
  res.json({ invites: rows });
});

// Persist the triage status of an invite (per contact / chat_id). Upserts the
// invite_triage row, snapshotting the representative message so the Kanban and
// the "em aberto" count reflect real, saved state. Tenant-scoped.
const inviteStatusSchema = z.object({
  chatId: z.string().min(1),
  status: z.enum(["aberto", "resolvido", "ignorado"]),
  sourceMessageId: z.string().nullable().optional(),
  direction: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
});
router.patch(
  "/metrics/private/invites/status",
  async (req: AuthedRequest, res) => {
    const parsed = inviteStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ err: parsed.error }, "invalid invite status body");
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const d = parsed.data;
    const { rows } = await pool.query(
      `insert into invite_triage
         (tenant_id, chat_id, status, source_message_id, direction, name, contact_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tenant_id, chat_id) do update
         set status = excluded.status,
             source_message_id = coalesce(excluded.source_message_id, invite_triage.source_message_id),
             direction = coalesce(excluded.direction, invite_triage.direction),
             name = coalesce(excluded.name, invite_triage.name),
             contact_id = coalesce(excluded.contact_id, invite_triage.contact_id),
             updated_at = now()
       returning *`,
      [
        tenant(req),
        d.chatId,
        d.status,
        d.sourceMessageId ?? null,
        d.direction ?? null,
        d.name ?? null,
        d.contactId ?? null,
      ],
    );
    res.json({ triage: rows[0] });
  },
);

// Convert an invite into a task (Tasks). Resolves the contact by primary_phone
// when contactId is not provided, creates the task (reusing the tasks table /
// shape), and marks the invite as 'resolvido' so it leaves the open column.
const inviteToTaskSchema = z.object({
  chatId: z.string().min(1),
  title: z.string().min(1),
  direction: z.enum(["mine", "theirs"]).nullable().optional(),
  sourceMessageId: z.string().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  name: z.string().nullable().optional(),
  inviteDirection: z.string().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
router.post(
  "/metrics/private/invites/to-task",
  async (req: AuthedRequest, res) => {
    const parsed = inviteToTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ err: parsed.error }, "invalid invite to-task body");
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    const t = tenant(req);
    const d = parsed.data;
    // Resolve contact by phone (chat_id) when not given, so the task links to
    // the CRM entry without forcing the client to know the contact id.
    let contactId = d.contactId ?? null;
    if (!contactId) {
      const found = await pool.query(
        `select id from contacts
          where tenant_id = $1 and primary_phone = $2 limit 1`,
        [t, d.chatId],
      );
      contactId = found.rows[0]?.id ?? null;
    }
    const taskRes = await pool.query(
      `insert into tasks
         (tenant_id, contact_id, title, direction, source_message_id, due_at)
       values ($1, $2, $3, $4, $5, $6) returning *`,
      [
        t,
        contactId,
        d.title,
        d.direction ?? null,
        d.sourceMessageId ?? null,
        d.dueAt ?? null,
      ],
    );
    // Mark the invite resolved (it became an actionable task).
    await pool.query(
      `insert into invite_triage
         (tenant_id, chat_id, status, source_message_id, direction, name, contact_id)
       values ($1, $2, 'resolvido', $3, $4, $5, $6)
       on conflict (tenant_id, chat_id) do update
         set status = 'resolvido',
             source_message_id = coalesce(excluded.source_message_id, invite_triage.source_message_id),
             direction = coalesce(excluded.direction, invite_triage.direction),
             name = coalesce(excluded.name, invite_triage.name),
             contact_id = coalesce(excluded.contact_id, invite_triage.contact_id),
             updated_at = now()`,
      [
        t,
        d.chatId,
        d.sourceMessageId ?? null,
        d.inviteDirection ?? null,
        d.name ?? null,
        contactId,
      ],
    );
    res.status(201).json({ task: taskRes.rows[0] });
  },
);

// Average / median response time for private chats over the period, measured in
// *business minutes* (see WORK_* config above). For each inbound message that
// *starts* an inbound block (previous message was not inbound), we find the next
// outbound (owner) reply, capped at 3 days of wall-clock time to ignore
// abandoned threads. The latency is then the working time that elapses between
// the two: for each calendar day the pair spans we take the overlap of the gap
// with that day's [start,end) window, counting weekdays only. This stops
// overnight/weekend gaps from inflating the average.
router.get("/metrics/private/response-time", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const { rows } = await pool.query(
    `with base as (
       select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as chat_id,
              message_created_at, direction
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private'
          and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
          and message_created_at >= now() - ($2 || ' days')::interval
     ),
     marked as (
       select chat_id, message_created_at, direction,
              lag(direction) over (partition by chat_id order by message_created_at) as prev_dir
         from base
     ),
     resolved as (
       select chat_id, message_created_at, direction, prev_dir,
              min(case when direction = 'outbound' then message_created_at end)
                over (partition by chat_id order by message_created_at
                      rows between 1 following and unbounded following) as next_outbound
         from marked
     ),
     pairs as (
       select (message_created_at at time zone $3) as t1,
              (next_outbound at time zone $3) as t2
         from resolved
        where direction = 'inbound'
          and prev_dir is distinct from 'inbound'
          and next_outbound is not null
          and next_outbound - message_created_at < interval '3 days'
     ),
     latencies as (
       select (
         select coalesce(sum(
           greatest(0, extract(epoch from (
             least(p.t2, d::timestamp + make_interval(hours => $5::int))
             - greatest(p.t1, d::timestamp + make_interval(hours => $4::int))
           )))
         ), 0)
         from generate_series(p.t1::date, p.t2::date, interval '1 day') as d
        where extract(isodow from d) <= 5
       ) / 60.0 as mins
       from pairs p
     )
     select round(avg(mins))::int as avg_minutes,
            round(percentile_cont(0.5) within group (order by mins))::int as median_minutes,
            count(*)::int as sample
       from latencies`,
    [OWNER, String(days), WORK_TZ, WORK_START_HOUR, WORK_END_HOUR],
  );
  const r = rows[0] ?? {};
  res.json({
    avg_minutes: r.avg_minutes ?? null,
    median_minutes: r.median_minutes ?? null,
    sample: r.sample ?? 0,
    work_window: {
      start_hour: WORK_START_HOUR,
      end_hour: WORK_END_HOUR,
      tz: WORK_TZ,
      weekdays_only: true,
    },
  });
});

// Volume summary: current period vs previous period (received), avg/day, and a
// fixed 30-day daily sparkline (independent of the selected period).
router.get("/metrics/private/volume-summary", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 7);
  const [compare, spark] = await Promise.all([
    pool.query(
      `select
         count(*) filter (
           where message_created_at >= now() - ($2 || ' days')::interval
         )::int as current,
         count(*) filter (
           where message_created_at >= now() - (($2::int * 2) || ' days')::interval
             and message_created_at < now() - ($2 || ' days')::interval
         )::int as previous
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private' and direction = 'inbound'
        and message_created_at >= now() - (($2::int * 2) || ' days')::interval`,
      [OWNER, String(days)],
    ),
    pool.query(
      `select to_char(date_trunc('day', message_created_at), 'YYYY-MM-DD') as day,
              count(*)::int as received
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private' and direction = 'inbound'
          and message_created_at >= now() - interval '30 days'
        group by 1 order by 1`,
      [OWNER],
    ),
  ]);
  const current = compare.rows[0]?.current ?? 0;
  const previous = compare.rows[0]?.previous ?? 0;
  const pctChange =
    previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0
        ? 100
        : 0;
  res.json({
    current,
    previous,
    pctChange,
    avgPerDay: Math.round((current / days) * 10) / 10,
    days,
    sparkline: spark.rows,
  });
});

// Unified intelligence panel: ranked pautas (what people bring to me) with the
// top contacts that generate each one (deduped by contact).
router.get("/metrics/private/intelligence", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const limit = Math.min(Number(req.query.limit ?? 30), 60);
  const { rows } = await pool.query(
    `with exploded as (
       select unnest(e.topics) as topic,
              coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) as chat_id,
              coalesce(nullif(m.chat_name,''), nullif(m.sender_name,'')) as person
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
          and m.whatsapp_owner = $2
        where e.tenant_id = $1 and e.chat_type = 'private'
          and e.topics is not null
          and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) is not null
          and m.message_created_at >= now() - ($3 || ' days')::interval
     ),
     prev as (
       select topic, count(*)::int as n from (
         select unnest(e.topics) as topic
           from message_enrichment e
           join whatsapp_messages m on m.message_id = e.message_id
            and m.whatsapp_owner = $2
          where e.tenant_id = $1 and e.chat_type = 'private'
            and e.topics is not null
            and m.message_created_at >= now() - (($3::int * 2) || ' days')::interval
            and m.message_created_at < now() - ($3 || ' days')::interval
       ) p
       where topic is not null and length(trim(topic)) > 0
       group by topic
     ),
     ranked as (
       select topic, chat_id, max(person) as person, count(*)::int as n
         from exploded
        where topic is not null and length(trim(topic)) > 0
          and lower(trim(topic)) <> all($5::text[])
        group by topic, chat_id
     ),
     totals as (
       select topic, sum(n)::int as count, count(distinct chat_id)::int as person_count
         from ranked
        group by topic
        order by count desc
        limit $4
     )
     select t.topic, t.count, t.person_count,
            coalesce((select p.n from prev p where p.topic = t.topic), 0) as prev_count,
            coalesce((
              select json_agg(json_build_object('name', r.person, 'count', r.n)
                              order by r.n desc)
                from (
                  select person, n from ranked r2
                   where r2.topic = t.topic
                   order by n desc limit 3
                ) r
            ), '[]'::json) as people
       from totals t
      order by t.count desc`,
    [tenant(req), OWNER, String(days), limit, TOPIC_BLACKLIST],
  );
  res.json({ intelligence: rows });
});

// Real message excerpts for a given topic (drill-down for the topic cloud/list).
router.get("/metrics/private/topic-examples", async (req: AuthedRequest, res) => {
  const topic = (req.query.topic as string | undefined)?.trim();
  if (!topic) {
    res.status(400).json({ error: "topic_required" });
    return;
  }
  const days = parseDays(req.query.days, 30);
  const limit = Math.min(Number(req.query.limit ?? 12), 50);
  const { rows } = await pool.query(
    `select m.message_id, m.direction, m.message_created_at,
            coalesce(nullif(m.chat_name,''), nullif(m.sender_name,'')) as sender_name,
            coalesce(nullif(m.message,''), m.caption, m.transcription) as text
       from message_enrichment e
       join whatsapp_messages m on m.message_id = e.message_id
        and m.whatsapp_owner = $2
      where e.tenant_id = $1 and e.chat_type = 'private'
        and e.topics is not null and $3 = any(e.topics)
        and m.message_created_at >= now() - ($4 || ' days')::interval
      order by m.message_created_at desc
      limit $5`,
    [tenant(req), OWNER, topic, String(days), limit],
  );
  res.json({ examples: rows });
});

// Contact pendencies: merges "unanswered" (last inbound needing a reply) with
// open tasks, one row per contact (deduped). Used by the redesigned Privado
// page to replace the Sentiment + raw Unanswered list.
router.get("/metrics/private/pending", async (req: AuthedRequest, res) => {
  const t = tenant(req);
  const days = parseDays(req.query.days, 30);
  const [unansweredRes, tasksRes] = await Promise.all([
    pool.query(
      `with src as (
         select coalesce(nullif(chat_id,''), nullif(contact_phone,'')) as phone,
                message_id, message_created_at, direction, chat_name, sender_name,
                message, caption, transcription
           from whatsapp_messages
          where whatsapp_owner = $1 and chat_type = 'private'
            and coalesce(nullif(chat_id,''), nullif(contact_phone,'')) is not null
            and message_created_at >= now() - ($2 || ' days')::interval
       ),
       last_msg as (
         select distinct on (phone)
                phone, message_id, message_created_at, direction,
                coalesce(nullif(chat_name,''), sender_name) as name,
                coalesce(nullif(message,''), caption, transcription) as text
           from src
          order by phone, message_created_at desc
       )
       select l.phone as chat_id, l.name, l.text, l.message_created_at as last_at,
              e.category, e.summary
         from last_msg l
         left join message_enrichment e on e.message_id = l.message_id
        where l.direction = 'inbound'
          and e.requires_reply is true
          and not exists (
            select 1 from pending_dismissals d
             where d.tenant_id = $3 and d.chat_id = l.phone
               and (d.snooze_until is null or d.snooze_until > now())
          )
        order by l.message_created_at desc`,
      [OWNER, String(days), t],
    ),
    pool.query(
      `select c.id as contact_id, c.primary_phone as phone, c.display_name,
              json_agg(json_build_object(
                'id', tk.id, 'title', tk.title, 'direction', tk.direction,
                'due_at', tk.due_at
              ) order by tk.due_at asc nulls last) as tasks,
              count(*)::int as open_tasks
         from contacts c
         join tasks tk on tk.contact_id = c.id and tk.tenant_id = $1
        where c.tenant_id = $1 and c.primary_phone is not null and tk.done = false
        group by c.id, c.primary_phone, c.display_name`,
      [t],
    ),
  ]);

  type Pending = {
    chat_id: string;
    name: string | null;
    contact_id: string | null;
    unanswered: boolean;
    last_text: string | null;
    last_at: string | null;
    category: string | null;
    summary: string | null;
    open_tasks: number;
    tasks: Array<Record<string, unknown>>;
    reason: string;
  };

  const byPhone = new Map<string, Pending>();
  for (const u of unansweredRes.rows) {
    byPhone.set(u.chat_id, {
      chat_id: u.chat_id,
      name: u.name ?? null,
      contact_id: null,
      unanswered: true,
      last_text: u.summary || u.text || null,
      last_at: u.last_at ?? null,
      category: u.category ?? null,
      summary: u.summary ?? null,
      open_tasks: 0,
      tasks: [],
      reason: "Mensagem não respondida",
    });
  }
  for (const ct of tasksRes.rows) {
    const phone = ct.phone as string;
    const existing = byPhone.get(phone);
    const taskLabel = `${ct.open_tasks} tarefa${ct.open_tasks > 1 ? "s" : ""} em aberto`;
    if (existing) {
      existing.contact_id = ct.contact_id;
      existing.open_tasks = ct.open_tasks;
      existing.tasks = ct.tasks ?? [];
      existing.reason = `Não respondida · ${taskLabel}`;
      if (!existing.name) existing.name = ct.display_name ?? null;
    } else {
      byPhone.set(phone, {
        chat_id: phone,
        name: ct.display_name ?? null,
        contact_id: ct.contact_id,
        unanswered: false,
        last_text: null,
        last_at: null,
        category: null,
        summary: null,
        open_tasks: ct.open_tasks,
        tasks: ct.tasks ?? [],
        reason: taskLabel,
      });
    }
  }

  const pending = Array.from(byPhone.values()).sort((a, b) => {
    // Unanswered first, then by recency / task count.
    if (a.unanswered !== b.unanswered) return a.unanswered ? -1 : 1;
    const at = a.last_at ? new Date(a.last_at).getTime() : 0;
    const bt = b.last_at ? new Date(b.last_at).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.open_tasks - a.open_tasks;
  });

  res.json({ pending });
});

// Recent message thread for a private chat (drill-down for the pending drawer).
router.get("/metrics/private/thread", async (req: AuthedRequest, res) => {
  const chatId = req.query.chatId as string | undefined;
  if (!chatId) {
    res.status(400).json({ error: "chatId_required" });
    return;
  }
  const limit = Math.min(Number(req.query.limit ?? 40), 200);
  // Match by the effective DM phone (chat_id OR contact_phone fallback) so the
  // thread shows every message of a contact whose key came from contact_phone,
  // mirroring /contacts/:id/messages.
  const { rows } = await pool.query(
    `select message_id, direction, message_created_at,
            coalesce(nullif(message,''), caption, transcription) as text
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'private'
        and (chat_id = $2 or nullif(contact_phone,'') = $2)
      order by message_created_at desc
      limit $3`,
    [OWNER, chatId, limit],
  );
  // Return chronological (oldest first) for display.
  res.json({ messages: rows.reverse() });
});

// Snooze (or dismiss) an "unanswered" pendency for a chosen period. Keyed by
// chat_id + tenant; while snooze_until is in the future the contact drops out of
// the unanswered queue above, then reappears automatically once it passes.
const snoozeSchema = z.object({
  chatId: z.string().min(1),
  days: z.number().int().min(1).max(365),
});
router.post("/metrics/private/pending/snooze", async (req: AuthedRequest, res) => {
  const parsed = snoozeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { chatId, days } = parsed.data;
  await pool.query(
    `insert into pending_dismissals (tenant_id, chat_id, snooze_until)
     values ($1, $2, now() + ($3 || ' days')::interval)
     on conflict (tenant_id, chat_id)
     do update set snooze_until = excluded.snooze_until, created_at = now()`,
    [tenant(req), chatId, String(days)],
  );
  res.json({ ok: true });
});

// Reactivate a previously snoozed/dismissed pendency (removes the dismissal).
const unsnoozeSchema = z.object({ chatId: z.string().min(1) });
router.post(
  "/metrics/private/pending/unsnooze",
  async (req: AuthedRequest, res) => {
    const parsed = unsnoozeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    await pool.query(
      `delete from pending_dismissals where tenant_id = $1 and chat_id = $2`,
      [tenant(req), parsed.data.chatId],
    );
    res.json({ ok: true });
  },
);

// counts that head the redesigned Visão Geral: received, sent, audios, images,
// documents and active groups in the selected period.
router.get("/metrics/overview", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 7);
  const { rows } = await pool.query(
    `select
        count(*) filter (
          where chat_type = 'private' and direction = 'inbound'
        )::int as received,
        count(*) filter (
          where chat_type = 'private' and direction = 'outbound'
        )::int as sent,
        count(*) filter (
          where chat_type = 'private'
            and (
              metadata->>'raw_type' = 'AudioMessage'
              or lower(coalesce(message_type, '')) like any(array['%audio%','%ptt%'])
              or coalesce(media_mime_type, '') like 'audio/%'
            )
        )::int as audios,
        count(*) filter (
          where metadata->>'raw_type' = 'ImageMessage'
             or lower(coalesce(message_type, '')) like '%image%'
             or coalesce(media_mime_type, '') like 'image/%'
        )::int as images,
        count(*) filter (
          where metadata->>'raw_type' = 'DocumentMessage'
             or lower(coalesce(message_type, '')) like '%document%'
             or (
               coalesce(media_mime_type, '') like 'application/%'
               and coalesce(media_mime_type, '') not like 'application/json%'
             )
        )::int as documents,
        count(distinct chat_id) filter (
          where chat_type = 'group' and chat_id is not null
        )::int as groups
       from whatsapp_messages
      where whatsapp_owner = $1
        and message_created_at >= now() - ($2 || ' days')::interval`,
    [OWNER, String(days)],
  );
  const r = rows[0] ?? {};
  res.json({
    received: r.received ?? 0,
    sent: r.sent ?? 0,
    audios: r.audios ?? 0,
    images: r.images ?? 0,
    documents: r.documents ?? 0,
    groups: r.groups ?? 0,
    audioMinutes: null,
  });
});

// Daily received-volume of the current period aligned, day-by-day, against the
// equivalent previous period (e.g. last 7 days vs the 7 days before). Series is
// keyed by `offset` (0..days-1) so the frontend can overlay the two lines, with
// `day` being the current-period calendar date for that offset. Totals + pct
// change are derived from the series. Replaces the sentiment-dependent block.
router.get("/metrics/private/volume-compare", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 7);
  const { rows } = await pool.query(
    `with g as (select generate_series(0, $2::int - 1) as off),
     cur as (
       select ((message_created_at at time zone $3)::date) as d, count(*)::int as n
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private' and direction = 'inbound'
          and message_created_at >= now() - ($2 || ' days')::interval
        group by 1
     ),
     prev as (
       select ((message_created_at at time zone $3)::date) as d, count(*)::int as n
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'private' and direction = 'inbound'
          and message_created_at >= now() - (($2::int * 2) || ' days')::interval
          and message_created_at < now() - ($2 || ' days')::interval
        group by 1
     )
     select g.off as offset,
            to_char((now() at time zone $3)::date - ($2::int - 1) + g.off, 'YYYY-MM-DD') as day,
            coalesce(c.n, 0)::int as current,
            coalesce(p.n, 0)::int as previous
       from g
       left join cur c on c.d = (now() at time zone $3)::date - ($2::int - 1) + g.off
       left join prev p on p.d = (now() at time zone $3)::date - ($2::int * 2 - 1) + g.off
      order by g.off`,
    [OWNER, String(days), WORK_TZ],
  );
  const current = rows.reduce((acc, r) => acc + Number(r.current), 0);
  const previous = rows.reduce((acc, r) => acc + Number(r.previous), 0);
  const pctChange =
    previous > 0
      ? Math.round(((current - previous) / previous) * 100)
      : current > 0
        ? 100
        : 0;
  res.json({ days, current, previous, pctChange, series: rows });
});

// Content ideas: derived (no new AI) from the enriched pautas of *inbound*
// private messages. The signal is "what people bring to / ask me about" — we
// rank by how often a topic shows up as a question, then by raw frequency, with
// the generic-noise blacklist applied. Each row carries how many distinct people
// raised it so the UI can frame "N pessoas perguntaram sobre X".
router.get("/metrics/private/content-ideas", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const limit = Math.min(Number(req.query.limit ?? 8), 30);
  const { rows } = await pool.query(
    `with exploded as (
       select unnest(e.topics) as topic,
              coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) as chat_id,
              e.is_question
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
          and m.whatsapp_owner = $2
        where e.tenant_id = $1 and e.chat_type = 'private'
          and m.direction = 'inbound' and e.topics is not null
          and coalesce(nullif(m.chat_id,''), nullif(m.contact_phone,'')) is not null
          and m.message_created_at >= now() - ($3 || ' days')::interval
     )
     select topic, count(*)::int as count,
            count(distinct chat_id)::int as person_count,
            count(*) filter (where is_question)::int as question_count
       from exploded
      where topic is not null and length(trim(topic)) > 0
        and lower(trim(topic)) <> all($5::text[])
      group by topic
      order by question_count desc, count desc
      limit $4`,
    [tenant(req), OWNER, String(days), limit, TOPIC_BLACKLIST],
  );
  res.json({ ideas: rows });
});

// Group topic cloud: top enriched pautas across non-support group chats in the
// period (blacklist-filtered). Powers the Overview "métricas de grupos" cloud.
// Support/noise groups (user-managed) are excluded so the cloud reflects signal.
router.get("/metrics/groups/topics", async (req: AuthedRequest, res) => {
  const days = parseDays(req.query.days, 30);
  const limit = Math.min(Number(req.query.limit ?? 40), 80);
  const { rows } = await pool.query(
    `with exploded as (
       select trim(unnest(e.topics)) as topic, m.chat_id
         from message_enrichment e
         join whatsapp_messages m on m.message_id = e.message_id
          and m.whatsapp_owner = $2
        where e.tenant_id = $1 and e.chat_type = 'group'
          and e.topics is not null
          and m.message_created_at >= now() - ($3 || ' days')::interval
          and not exists (
            select 1 from support_groups sg
             where sg.tenant_id = $1 and sg.chat_id = m.chat_id
          )
     ),
     norm as (
       select lower(topic) as key, topic, chat_id
         from exploded
        where length(topic) > 0
          and lower(topic) <> all($5::text[])
     ),
     label as (
       select key, (array_agg(topic order by cnt desc, topic))[1] as label
         from (
           select key, topic, count(*)::int as cnt
             from norm group by key, topic
         ) t
        group by key
     )
     select l.label as topic,
            count(*)::int as count,
            count(distinct n.chat_id)::int as group_count
       from norm n
       join label l on l.key = n.key
      group by l.label
      order by count desc
      limit $4`,
    [tenant(req), OWNER, String(days), limit, GROUP_TOPIC_BLACKLIST],
  );
  res.json({ topics: rows });
});

// Real message excerpts for a given group topic (drill-down for the group
// topic cloud). Mirrors /metrics/private/topic-examples but for chat_type
// 'group', excluding support_groups. Matches the topic case-insensitively
// because the group cloud labels are normalized by lowercased key.
router.get("/metrics/groups/topic-examples", async (req: AuthedRequest, res) => {
  const topic = (req.query.topic as string | undefined)?.trim();
  if (!topic) {
    res.status(400).json({ error: "topic_required" });
    return;
  }
  const days = parseDays(req.query.days, 30);
  const limit = Math.min(Number(req.query.limit ?? 12), 50);
  const { rows } = await pool.query(
    `select m.message_id, m.direction, m.message_created_at,
            coalesce(nullif(m.sender_name,''), nullif(m.chat_name,'')) as sender_name,
            coalesce(nullif(m.message,''), m.caption, m.transcription) as text
       from message_enrichment e
       join whatsapp_messages m on m.message_id = e.message_id
        and m.whatsapp_owner = $2
      where e.tenant_id = $1 and e.chat_type = 'group'
        and e.topics is not null
        and exists (
          select 1 from unnest(e.topics) as tp
           where lower(trim(tp)) = lower($3)
        )
        and m.message_created_at >= now() - ($4 || ' days')::interval
        and not exists (
          select 1 from support_groups sg
           where sg.tenant_id = $1 and sg.chat_id = m.chat_id
        )
      order by m.message_created_at desc
      limit $5`,
    [tenant(req), OWNER, topic, String(days), limit],
  );
  // Which groups this topic circulates in (name + message count), so the
  // drawer can route the user straight to the right group digest.
  const { rows: groups } = await pool.query(
    `select m.chat_id,
            coalesce(nullif(max(m.chat_name),''), m.chat_id) as chat_name,
            count(*)::int as message_count
       from message_enrichment e
       join whatsapp_messages m on m.message_id = e.message_id
        and m.whatsapp_owner = $2
      where e.tenant_id = $1 and e.chat_type = 'group'
        and e.topics is not null
        and exists (
          select 1 from unnest(e.topics) as tp
           where lower(trim(tp)) = lower($3)
        )
        and m.message_created_at >= now() - ($4 || ' days')::interval
        and not exists (
          select 1 from support_groups sg
           where sg.tenant_id = $1 and sg.chat_id = m.chat_id
        )
      group by m.chat_id
      order by message_count desc`,
    [tenant(req), OWNER, topic, String(days)],
  );
  res.json({ examples: rows, groups });
});

export default router;
