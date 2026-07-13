/**
 * Envia resumo diário ao Telegram (CLI / cron no Mac).
 * A lógica principal está em artifacts/api-server/src/lib/daily-digest.ts
 */
import { pool } from "@workspace/db";

const force = process.argv.includes("--force");

async function main(): Promise<void> {
  const mod = await import(
    "../../artifacts/api-server/src/lib/daily-digest.ts"
  );
  const result = await mod.sendDailyDigest({ force });
  if (result.sent) {
    console.log("✓ Resumo diário enviado ao Telegram");
  } else {
    console.log(`= Não enviado: ${result.reason ?? "desconhecido"}`);
  }
  await pool.end();
}

void main().catch((e) => {
  console.error("daily-digest failed:", (e as Error).message);
  process.exit(1);
});
