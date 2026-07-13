#!/usr/bin/env node
/** Valida .env sem imprimir segredos. Rode: node scripts/check-env.mjs */

const url = process.env.SUPABASE_DB_URL ?? "";

const problems = [];

if (!url) problems.push("SUPABASE_DB_URL ausente");
if (/\[SUA-SENHA\]|your-|change-me|COLE-/i.test(url)) {
  problems.push("SUPABASE_DB_URL ainda tem placeholder — cole a URI completa do dashboard");
}
if (!process.env.SUPABASE_URL) problems.push("SUPABASE_URL ausente");
if (!process.env.SUPABASE_SERVICE_KEY) problems.push("SUPABASE_SERVICE_KEY ausente");

try {
  const p = new URL(url);
  if (!p.password) problems.push("SUPABASE_DB_URL sem senha na URI");
  if (/[*+#]/.test(p.password)) {
    problems.push(
      "senha na URI precisa estar URL-encoded (* → %2A, + → %2B) — copie do dashboard",
    );
  }
  console.log("host:", p.hostname);
  console.log("port:", p.port || "(default)");
  console.log("user:", p.username);
} catch {
  problems.push("SUPABASE_DB_URL não é uma URL válida");
}

if (problems.length) {
  console.error("\nProblemas:");
  for (const p of problems) console.error(" -", p);
  process.exit(1);
}

console.log("\nFormato OK. Teste a conexão com: pnpm --filter @workspace/scripts run migrate");
