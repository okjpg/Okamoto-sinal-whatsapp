/**
 * Polling local para o menu do bot funcionar sem webhook público.
 * Ctrl+C para encerrar.
 */
import { pool } from "@workspace/db";

let offset = 0;

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN ausente");

  const { handleTelegramUpdate, ensureTelegramCommands } = await import(
    "../../artifacts/api-server/src/lib/telegram-bot.ts"
  );
  await ensureTelegramCommands();

  console.log("Telegram polling ativo — use /start no @sinalpeep_bot");
  console.log("Ctrl+C para parar");

  const poll = async (): Promise<void> => {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=30&offset=${offset}`;
      const r = await fetch(url);
      const data = (await r.json()) as {
        ok: boolean;
        result: { update_id: number }[];
      };
      if (!data.ok) return;
      for (const u of data.result) {
        offset = u.update_id + 1;
        await handleTelegramUpdate(u);
      }
    } catch (e) {
      console.warn("poll error:", (e as Error).message);
    }
    setTimeout(() => void poll(), 500);
  };

  void poll();

  process.on("SIGINT", async () => {
    await pool.end();
    process.exit(0);
  });
}

void main().catch((e) => {
  console.error("telegram-poll failed:", (e as Error).message);
  process.exit(1);
});
