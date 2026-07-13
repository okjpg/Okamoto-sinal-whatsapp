/**
 * Registra webhook e comandos do bot Telegram.
 * Uso: source scripts/env.sh && pnpm --filter @workspace/scripts run telegram-setup
 */
import { pool } from "@workspace/db";

async function telegramApi(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok || (json as { ok?: boolean }).ok === false) {
    throw new Error(`${method} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function main(): Promise<void> {
  const publicUrl = process.env.SINAL_PUBLIC_URL?.trim();
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  const commands = await import(
    "../../artifacts/api-server/src/lib/telegram.ts"
  );
  await commands.registerTelegramCommands(process.env.TELEGRAM_BOT_TOKEN!.trim());
  console.log("✓ Comandos do bot registrados (/start, /resumo, …)");

  if (publicUrl) {
    const hookUrl = `${publicUrl.replace(/\/$/, "")}/api/telegram/webhook`;
    const body: Record<string, unknown> = { url: hookUrl };
    if (webhookSecret) {
      body.secret_token = webhookSecret;
    }
    await telegramApi("setWebhook", body);
    console.log(`✓ Webhook: ${hookUrl}`);
  } else {
    await telegramApi("deleteWebhook", { drop_pending_updates: false });
    console.log("= Webhook removido (sem SINAL_PUBLIC_URL)");
    console.log("  Para menu interativo local, use: pnpm --filter @workspace/scripts run telegram-poll");
  }

  await pool.end();
}

void main().catch((e) => {
  console.error("telegram-setup failed:", (e as Error).message);
  process.exit(1);
});
