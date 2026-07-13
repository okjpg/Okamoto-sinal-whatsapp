import { pool, MVP_TENANT_ID } from "@workspace/db";
import {
  fetchEvolutionGroups,
  getEvolutionApiConfigFromEnv,
} from "@workspace/evolution";

// Sync real WhatsApp group names from Evolution into whatsapp_messages + groups.
// Run: pnpm --filter @workspace/scripts run sync-group-names
const TENANT = MVP_TENANT_ID;
const OWNER = process.env.WHATSAPP_OWNER;

async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required");

  const cfg = getEvolutionApiConfigFromEnv();
  if (!cfg) {
    console.error("Evolution API not configured (EVOLUTION_API_URL / EVOLUTION_API_KEY).");
    process.exit(1);
  }

  console.log(`[sync-group-names] fetching groups from ${cfg.instance}...`);
  const remote = await fetchEvolutionGroups(cfg);
  console.log(`[sync-group-names] ${remote.length} groups on Evolution.`);

  let updatedMessages = 0;
  let upsertedGroups = 0;

  for (const g of remote) {
    if (!g.subject) continue;

    const msgRes = await pool.query(
      `update whatsapp_messages
          set chat_name = $1
        where whatsapp_owner = $2
          and chat_type = 'group'
          and chat_id = $3
          and coalesce(chat_name, '') is distinct from $1`,
      [g.subject, OWNER, g.id],
    );
    updatedMessages += msgRes.rowCount ?? 0;

    const stats = await pool.query<{
      message_count: number;
      last_activity_at: Date | null;
    }>(
      `select count(*)::int as message_count,
              max(message_created_at) as last_activity_at
         from whatsapp_messages
        where whatsapp_owner = $1 and chat_type = 'group' and chat_id = $2`,
      [OWNER, g.id],
    );
    const row = stats.rows[0];
    if (!row || row.message_count === 0) continue;

    await pool.query(
      `insert into groups (tenant_id, chat_id, name, message_count, last_activity_at)
       values ($1, $2, $3, $4, $5)
       on conflict (tenant_id, chat_id) do update set
         name = excluded.name,
         message_count = excluded.message_count,
         last_activity_at = excluded.last_activity_at`,
      [TENANT, g.id, g.subject, row.message_count, row.last_activity_at],
    );
    upsertedGroups += 1;
  }

  // Groups with messages but missing from Evolution list still get a groups row.
  const orphan = await pool.query(
    `insert into groups (tenant_id, chat_id, name, message_count, last_activity_at)
     select $1, m.chat_id,
            coalesce(nullif(max(m.chat_name), ''), m.chat_id),
            count(*)::int,
            max(m.message_created_at)
       from whatsapp_messages m
      where m.whatsapp_owner = $2 and m.chat_type = 'group' and m.chat_id is not null
      group by m.chat_id
      on conflict (tenant_id, chat_id) do update set
        message_count = excluded.message_count,
        last_activity_at = excluded.last_activity_at,
        name = coalesce(nullif(groups.name, ''), excluded.name)
     returning chat_id`,
    [TENANT, OWNER],
  );

  console.log(
    `[sync-group-names] done — ${updatedMessages} message rows renamed, ${upsertedGroups} groups from Evolution, ${orphan.rowCount ?? 0} groups upserted total.`,
  );
  await pool.end();
}

void main().catch(async (e) => {
  console.error("sync-group-names failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
