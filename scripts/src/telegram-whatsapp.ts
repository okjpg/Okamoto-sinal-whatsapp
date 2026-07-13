/**
 * Envia a tela WhatsApp + menu atualizado no Telegram.
 */
import { pool } from "@workspace/db";

async function main(): Promise<void> {
  const { loadEnrichedContext } = await import(
    "../../artifacts/api-server/src/lib/telegram-data.ts"
  );
  const { buildWhatsAppMessage, buildWelcomeMessage } = await import(
    "../../artifacts/api-server/src/lib/telegram-content.ts"
  );
  const { sendTelegramMessage, telegramConfigFromEnv } = await import(
    "../../artifacts/api-server/src/lib/telegram.ts"
  );
  const { ensureTelegramCommands } = await import(
    "../../artifacts/api-server/src/lib/telegram-bot.ts"
  );

  const cfg = telegramConfigFromEnv();
  if (!cfg) throw new Error("Telegram não configurado");

  await ensureTelegramCommands();
  const ctx = await loadEnrichedContext();
  const wa = buildWhatsAppMessage(ctx);
  await sendTelegramMessage(cfg, wa.text, {
    parseMode: wa.parseMode,
    replyMarkup: wa.replyMarkup,
  });
  console.log("✓ Tela WhatsApp enviada ao Telegram");
  await pool.end();
}

void main().catch((e) => {
  console.error("telegram-whatsapp failed:", (e as Error).message);
  process.exit(1);
});
