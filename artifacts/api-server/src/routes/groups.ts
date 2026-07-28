import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { OWNER } from "../lib/scope";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

// List groups by activity (derived live from whatsapp_messages, read-only).
// Each row carries is_support so the UI can show / toggle the "suporte/ruído"
// flag, read from the tenant-scoped support_groups table.
// Groups matching exclude rules (by name pattern) are hidden unless ?show_excluded=1.
router.get("/groups", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const showExcluded = req.query.show_excluded === "1";
  const { rows } = await pool.query(
    `select g.chat_id,
            g.name,
            g.message_count,
            g.participants,
            g.last_activity_at,
            (sg.chat_id is not null) as is_support
       from (
         select chat_id,
                max(chat_name) as name,
                count(*)::int as message_count,
                count(distinct sender_phone)::int as participants,
                max(message_created_at) as last_activity_at
           from whatsapp_messages
          where whatsapp_owner = $1 and chat_type = 'group' and chat_id is not null
          group by chat_id
       ) g
       left join support_groups sg
              on sg.tenant_id = $2 and sg.chat_id = g.chat_id
      where ($4::bool or not exists (
        select 1 from group_exclude_rules er
         where er.tenant_id = $2 and g.name ilike '%' || er.pattern || '%'
      ))
      order by g.message_count desc
      limit $3`,
    [OWNER, t, limit, showExcluded],
  );
  res.json({ groups: rows });
});

// Mark a group as "suporte/ruído" (hidden by default on Mentions).
router.post("/groups/:chatId/support", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { chatId } = req.params;
  const name = await pool.query<{ name: string | null }>(
    `select max(chat_name) as name
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_type = 'group' and chat_id = $2
      having count(*) > 0`,
    [OWNER, chatId],
  );
  if (name.rowCount === 0) {
    return res.status(404).json({ error: "not_found" });
  }
  await pool.query(
    `insert into support_groups (tenant_id, chat_id, name)
       values ($1, $2, $3)
       on conflict (tenant_id, chat_id) do update set name = excluded.name`,
    [t, chatId, name.rows[0]?.name ?? null],
  );
  return res.json({ ok: true });
});

// Unmark a group: it stops being treated as support/noise.
router.delete("/groups/:chatId/support", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { chatId } = req.params;
  await pool.query(
    `delete from support_groups where tenant_id = $1 and chat_id = $2`,
    [t, chatId],
  );
  res.json({ ok: true });
});

// --- Group exclude rules (filter groups by name pattern) ---

// List all exclude rules for the tenant.
router.get("/groups/exclude-rules", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rows } = await pool.query(
    `select id, pattern, created_at from group_exclude_rules
      where tenant_id = $1 order by created_at`,
    [t],
  );
  res.json({ rules: rows });
});

// Add a new exclude rule.
router.post("/groups/exclude-rules", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { pattern } = req.body as { pattern?: string };
  if (!pattern?.trim()) {
    return res.status(400).json({ error: "pattern is required" });
  }
  const { rows } = await pool.query(
    `insert into group_exclude_rules (tenant_id, pattern)
     values ($1, $2)
     on conflict (tenant_id, pattern) do nothing
     returning id, pattern, created_at`,
    [t, pattern.trim()],
  );
  // Also auto-mark matching groups as support_groups for topic/mention exclusion
  await pool.query(
    `insert into support_groups (tenant_id, chat_id, name)
     select $1, chat_id, max(chat_name)
       from whatsapp_messages
      where whatsapp_owner = $2 and chat_type = 'group' and chat_id is not null
        and chat_name ilike '%' || $3 || '%'
      group by chat_id
     on conflict (tenant_id, chat_id) do update set name = excluded.name`,
    [t, OWNER, pattern.trim()],
  );
  return res.json({ rule: rows[0] ?? null, ok: true });
});

// Delete an exclude rule.
router.delete("/groups/exclude-rules/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  await pool.query(
    `delete from group_exclude_rules where tenant_id = $1 and id = $2`,
    [t, req.params.id],
  );
  res.json({ ok: true });
});

// Group digest: stored AI digest if present, plus live recent excerpts.
router.get("/groups/:chatId/digest", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { chatId } = req.params;
  const digest = await pool.query(
    `select * from group_digests
      where tenant_id = $1 and chat_id = $2
      order by created_at desc limit 1`,
    [t, chatId],
  );
  const excerpts = await pool.query(
    `select message_id, sender_name, message_created_at,
            coalesce(nullif(message,''), caption, transcription) as text
       from whatsapp_messages
      where whatsapp_owner = $1 and chat_id = $2 and chat_type = 'group'
        and coalesce(nullif(message,''), caption, transcription) is not null
      order by message_created_at desc limit 20`,
    [OWNER, chatId],
  );
  res.json({
    digest: digest.rows[0] ?? null,
    recentExcerpts: excerpts.rows,
  });
});

export default router;
