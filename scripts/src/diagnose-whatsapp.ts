import { pool } from "@workspace/db";

async function main(): Promise<void> {
  const owner = process.env.WHATSAPP_OWNER?.trim();
  console.log("WHATSAPP_OWNER:", owner ?? "(ausente)");
  console.log("EVOLUTION_INSTANCE:", process.env.EVOLUTION_INSTANCE ?? "(padrão)");
  console.log("SINAL_PUBLIC_URL:", process.env.SINAL_PUBLIC_URL ?? "(vazio)");
  console.log(
    "EVOLUTION_WEBHOOK_URL:",
    process.env.EVOLUTION_WEBHOOK_URL ?? "(derivado de SINAL_PUBLIC_URL)",
  );
  console.log();

  if (!owner) {
    console.error("WHATSAPP_OWNER ausente no .env");
    process.exit(1);
  }

  const stats = await pool.query<{
    total: number;
    last_at: Date | null;
    first_at: Date | null;
  }>(
    `select count(*)::int as total,
            max(message_created_at) as last_at,
            min(message_created_at) as first_at
       from whatsapp_messages
      where whatsapp_owner = $1`,
    [owner],
  );
  console.log("Mensagens no banco (owner atual):", stats.rows[0]);

  const recent = await pool.query(
    `select message_created_at, direction, chat_type,
            coalesce(nullif(chat_name,''), sender_name) as who,
            left(coalesce(message, caption, transcription, ''), 50) as preview
       from whatsapp_messages
      where whatsapp_owner = $1
      order by message_created_at desc
      limit 8`,
    [owner],
  );
  console.log("\nÚltimas mensagens:");
  if (recent.rows.length === 0) {
    console.log("  (nenhuma)");
  } else {
    for (const r of recent.rows) {
      console.log(
        `  ${new Date(r.message_created_at).toISOString()} | ${r.direction} | ${r.chat_type} | ${r.who ?? "?"} | ${r.preview ?? ""}`,
      );
    }
  }

  const owners = await pool.query(
    `select whatsapp_owner, count(*)::int as n, max(message_created_at) as last_at
       from whatsapp_messages
      group by whatsapp_owner`,
  );
  console.log("\nTodos os owners no banco:", owners.rows);

  await pool.end();
}

void main().catch((e) => {
  console.error("diagnose-whatsapp failed:", (e as Error).message);
  process.exit(1);
});
