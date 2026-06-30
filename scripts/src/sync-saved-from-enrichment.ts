import { pool, MVP_TENANT_ID } from "@workspace/db";

const OWNER = process.env.WHATSAPP_OWNER;

const MESSAGE_TEXT_SQL = `coalesce(
  nullif(trim(m.message), ''),
  nullif(trim(m.caption), ''),
  nullif(trim(m.transcription), '')
)`;

/** Auto-populate saved_items from requires_reply messages and mentions. Idempotent. */
async function main(): Promise<void> {
  if (!OWNER) throw new Error("WHATSAPP_OWNER is required");
  const tenantId = MVP_TENANT_ID;

  const replyRes = await pool.query(
    `insert into saved_items (tenant_id, kind, source_type, source_id, text)
     select $1, 'mensagem', 'auto', e.message_id,
            left(
              coalesce(
                nullif(trim(e.summary), ''),
                ${MESSAGE_TEXT_SQL},
                '[mensagem]'
              ),
              500
            )
       from message_enrichment e
       join whatsapp_messages m
         on m.message_id = e.message_id and m.whatsapp_owner = $2
      where e.tenant_id = $1
        and m.direction = 'inbound'
        and e.requires_reply is true
        and coalesce(nullif(trim(e.summary), ''), ${MESSAGE_TEXT_SQL}) is not null
        and not exists (
          select 1 from saved_items s
           where s.tenant_id = $1 and s.source_id = e.message_id
        )`,
    [tenantId, OWNER],
  );

  const mentionRes = await pool.query(
    `insert into saved_items (tenant_id, kind, source_type, source_id, text)
     select $1, 'mencao', 'auto', mn.message_id,
            left(
              coalesce(
                ${MESSAGE_TEXT_SQL},
                mn.mention_type || ' em ' || coalesce(m.chat_name, 'chat')
              ),
              500
            )
       from mentions mn
       join whatsapp_messages m
         on m.message_id = mn.message_id and m.whatsapp_owner = $2
      where mn.tenant_id = $1
        and not exists (
          select 1 from saved_items s
           where s.tenant_id = $1 and s.source_id = mn.message_id
        )`,
    [tenantId, OWNER],
  );

  console.log(
    `✓ ${replyRes.rowCount ?? 0} item(ns) salvos de mensagens que exigem resposta.`,
  );
  console.log(`✓ ${mentionRes.rowCount ?? 0} menção(ões) salva(s) automaticamente.`);

  const { rows: total } = await pool.query<{ n: string }>(
    `select count(*)::text as n from saved_items where tenant_id = $1`,
    [tenantId],
  );
  console.log(`  Total itens salvos: ${total[0]?.n ?? 0}`);

  await pool.end();
}

void main().catch(async (e) => {
  console.error("sync-saved-from-enrichment failed:", (e as Error).message);
  await pool.end().catch(() => {});
  process.exit(1);
});
