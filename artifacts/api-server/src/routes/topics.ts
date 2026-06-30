import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { OWNER } from "../lib/scope";

const router: IRouter = Router();
router.use(requireAuth);

// List topics (optionally cross-group only).
router.get("/topics", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const scope = req.query.scope as string | undefined;
  const crossgroup = req.query.crossgroup === "true";
  const params: unknown[] = [t];
  let where = "where t.tenant_id = $1";
  if (scope) {
    params.push(scope);
    where += ` and t.scope = $${params.length}`;
  }
  const cross = crossgroup
    ? "having count(distinct tg.chat_id) > 1"
    : "";
  const { rows } = await pool.query(
    `select t.id, t.label, t.scope, t.period_start, t.period_end,
            t.person_count, t.message_count, t.trend, t.summary,
            count(distinct tg.chat_id)::int as group_count
       from topics t
       left join topic_groups tg on tg.topic_id = t.id
       ${where}
       group by t.id
       ${cross}
       order by t.message_count desc nulls last`,
    params,
  );
  res.json({ topics: rows });
});

// Topic drill-down: groups it appears in + real message excerpts (the proof).
router.get("/topics/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { id } = req.params;
  const topicRes = await pool.query(
    `select * from topics where id = $1 and tenant_id = $2`,
    [id, t],
  );
  if (topicRes.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const groups = await pool.query(
    `select tg.chat_id,
            coalesce(
              nullif(g.name, ''),
              nullif(gn.chat_name, ''),
              tg.chat_id
            ) as name,
            tg.message_count
       from topic_groups tg
       left join groups g on g.chat_id = tg.chat_id and g.tenant_id = $2
       left join lateral (
         select max(wm.chat_name) as chat_name
           from whatsapp_messages wm
          where wm.whatsapp_owner = $3
            and wm.chat_type = 'group'
            and wm.chat_id = tg.chat_id
            and nullif(wm.chat_name, '') is not null
       ) gn on true
      where tg.topic_id = $1
      order by tg.message_count desc nulls last`,
    [id, t, OWNER],
  );
  const excerpts = await pool.query(
    `select m.message_id, m.chat_name, m.sender_name, m.message_created_at,
            coalesce(nullif(m.message,''), m.caption, m.transcription) as text
       from topic_messages tm
       join whatsapp_messages m on m.message_id = tm.message_id
      where tm.topic_id = $1 and m.whatsapp_owner = $2
      order by m.message_created_at desc
      limit 20`,
    [id, OWNER],
  );
  res.json({
    topic: topicRes.rows[0],
    groups: groups.rows,
    excerpts: excerpts.rows,
  });
});

export default router;
