import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool, syncMonitoredEntityFromEnv } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";

const router: IRouter = Router();
router.use(requireAuth);

// Monitored entities (you / each product) used for mention detection.
router.get("/entities", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  await syncMonitoredEntityFromEnv(pool, t).catch(() => {});
  const { rows } = await pool.query(
    `select e.*,
            (select count(*)::int from mentions m where m.entity_id = e.id) as mention_count
       from monitored_entities e
      where e.tenant_id = $1
      order by e.name`,
    [t],
  );
  res.json({ entities: rows });
});

const createSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  aliases: z.array(z.string()).optional(),
});

router.post("/entities", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const d = parsed.data;
  const { rows } = await pool.query(
    `insert into monitored_entities (tenant_id, name, type, aliases)
     values ($1,$2,$3,$4) returning *`,
    [t, d.name, d.type, d.aliases ?? []],
  );
  res.status(201).json({ entity: rows[0] });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
});

// Update an entity's name/type/keywords (aliases). Tenant-scoped.
router.patch("/entities/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const d = parsed.data;
  const sets: string[] = [];
  const params: unknown[] = [t, req.params.id];
  if (d.name !== undefined) {
    params.push(d.name);
    sets.push(`name = $${params.length}`);
  }
  if (d.type !== undefined) {
    params.push(d.type);
    sets.push(`type = $${params.length}`);
  }
  if (d.aliases !== undefined) {
    params.push(d.aliases);
    sets.push(`aliases = $${params.length}`);
  }
  if (sets.length === 0) {
    res.status(400).json({ error: "no_fields" });
    return;
  }
  const { rows } = await pool.query(
    `update monitored_entities set ${sets.join(", ")}
      where tenant_id = $1 and id = $2 returning *`,
    params,
  );
  if (rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ entity: rows[0] });
});

// Delete a monitored entity. Its mentions cascade (FK on delete cascade).
router.delete("/entities/:id", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const { rowCount } = await pool.query(
    `delete from monitored_entities where tenant_id = $1 and id = $2`,
    [t, req.params.id],
  );
  if (rowCount === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
