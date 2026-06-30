import { createClient } from "@supabase/supabase-js";
import { pool, MVP_TENANT_ID, syncMonitoredEntityFromEnv } from "@workspace/db";

// Creates (or ensures) the admin auth user and links it to the MVP tenant via
// the profiles table. Idempotent. Credentials are REQUIRED from the environment
// (no defaults) so a public deployment never ships a known password.
//
//   ADMIN_EMAIL    (required)
//   ADMIN_PASSWORD (required)
//
// Run: pnpm --filter @workspace/scripts run bootstrap-auth

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");
  }
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD are required (set them in your .env).",
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find existing user by email (paginate defensively).
  let userId: string | null = null;
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);

  if (existing) {
    userId = existing.id;
    // Ensure password matches the configured one.
    await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    console.log(`= user exists, password ensured: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`✓ created user: ${email}`);
  }

  // Link to tenant via profiles.
  await pool.query(
    `insert into profiles (id, tenant_id, email)
     values ($1, $2, $3)
     on conflict (id) do update set tenant_id = excluded.tenant_id, email = excluded.email`,
    [userId, MVP_TENANT_ID, email],
  );
  console.log(`✓ profile linked to tenant ${MVP_TENANT_ID}`);

  if (await syncMonitoredEntityFromEnv(pool, MVP_TENANT_ID)) {
    console.log(`✓ monitored entity synced from MONITORED_ENTITY_NAME`);
  }

  await pool.end();
  console.log(`\nLogin with: ${email} / ${password}`);
}

void main().catch((e) => {
  console.error("bootstrap-auth failed:", (e as Error).message);
  process.exit(1);
});
