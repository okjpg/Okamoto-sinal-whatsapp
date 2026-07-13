import type { Pool } from "pg";
import { MVP_TENANT_ID } from "./schema";

/** Applies MONITORED_ENTITY_NAME / MONITORED_ENTITY_ALIASES to the first tenant entity. */
export async function syncMonitoredEntityFromEnv(
  pool: Pool,
  tenantId: string = MVP_TENANT_ID,
): Promise<boolean> {
  const name = process.env.MONITORED_ENTITY_NAME?.trim();
  if (!name) return false;

  const extra = (process.env.MONITORED_ENTITY_ALIASES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const aliases = [...new Set([name, ...extra])];

  const { rowCount } = await pool.query(
    `update monitored_entities
        set name = $2,
            aliases = (
              select coalesce(array(
                select distinct unnest(coalesce(aliases, '{}') || $3::text[])
              ), '{}')
            )
      where tenant_id = $1
        and id = (
          select id from monitored_entities
           where tenant_id = $1
           order by name
           limit 1
        )`,
    [tenantId, name, aliases],
  );
  return (rowCount ?? 0) > 0;
}
