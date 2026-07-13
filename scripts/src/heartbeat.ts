import { pool } from "@workspace/db";

// Manual keep-alive ping. The daily schedule runs inside Supabase via pg_cron
// (migration 0013_project_heartbeat.sql).
//
// Run: pnpm --filter @workspace/scripts run heartbeat

async function main(): Promise<void> {
  await pool.query("select public.sinal_project_heartbeat($1)", ["manual"]);
  const { rows } = await pool.query<{ pinged_at: Date; source: string }>(
    `select pinged_at, source
       from project_heartbeats
      order by id desc
      limit 1`,
  );
  const row = rows[0];
  if (!row) {
    throw new Error("heartbeat row not found after insert");
  }
  console.log(
    `✓ heartbeat recorded (${row.source}) at ${new Date(row.pinged_at).toISOString()}`,
  );
  await pool.end();
}

void main().catch((e) => {
  console.error("heartbeat failed:", (e as Error).message);
  process.exit(1);
});
