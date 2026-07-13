import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "@workspace/db";

// Cria a tabela read-only de origem (não faz parte das migrations do app).
async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlPath = path.resolve(here, "../sql/create-whatsapp-messages.sql");
  const sql = readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  const { rows } = await pool.query<{ n: number }>(
    "select count(*)::int as n from whatsapp_messages",
  );
  console.log("✓ whatsapp_messages criada (linhas:", rows[0]?.n ?? 0, ")");
  await pool.end();
}

void main().catch((e) => {
  console.error("create-whatsapp-messages failed:", (e as Error).message);
  process.exit(1);
});
