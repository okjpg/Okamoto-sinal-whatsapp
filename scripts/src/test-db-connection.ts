import pg from "pg";

const base = process.env.SUPABASE_DB_URL;
if (!base) {
  console.error("SUPABASE_DB_URL não definida");
  process.exit(1);
}

const u = new URL(base);
const ref = u.username.startsWith("postgres.")
  ? u.username.slice("postgres.".length)
  : "gkwawlsebigybxntvqpr";
const password = u.password;
const enc = encodeURIComponent(password);

const candidates = [
  base,
  `postgresql://postgres.${ref}:${enc}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${enc}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${enc}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${enc}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${enc}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
];

const seen = new Set<string>();
const { Client } = pg;

for (const url of candidates) {
  const host = new URL(url).host;
  if (seen.has(host)) continue;
  seen.add(host);
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    await c.query("select 1");
    console.log("OK →", host);
    console.log("\nCole no .env (copie a URI completa do dashboard se possível):");
    console.log("SUPABASE_DB_URL=" + url.replace(password, "****"));
    await c.end();
    process.exit(0);
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    console.log("FAIL →", host, "—", msg.slice(0, 90));
    try {
      await c.end();
    } catch {}
  }
}

console.error("\nNenhuma conexão funcionou.");
console.error("Abra: https://supabase.com/dashboard/project/gkwawlsebigybxntvqpr/settings/database");
console.error("Copie a URI inteira (Transaction pooler, botão Copy) e substitua SUPABASE_DB_URL.");
process.exit(1);
