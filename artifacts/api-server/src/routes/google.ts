import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { z } from "zod/v4";
import {
  pool,
  getTenantGoogleCredentials,
  saveTenantGoogleCredentials,
  hasStoredGoogleCredentials,
  maskGoogleClientId,
  isGoogleReady,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { requireOwnerTenant } from "../lib/scope";
import { upsertEnvVars, envFilePath } from "../lib/env-file";
import * as g from "../lib/google";
import { listUpcomingCalendarEvents } from "../lib/google-calendar";

async function syncGoogleFromTenant(tenantId: string) {
  const creds = await getTenantGoogleCredentials(pool, tenantId);
  if (creds) g.applyGoogleEnv(creds);
  return creds;
}

const googleCredentialsSchema = z.object({
  clientId: z.string().min(12),
  clientSecret: z.string().min(8),
});

const router: IRouter = Router();

// Minimal self-contained HTML for the OAuth callback tab. It runs first-party
// (not in the app iframe), so it cannot reach the app session; instead it tells
// the opener window to refresh and closes itself.
function callbackPage(status: "connected" | "denied" | "error"): string {
  const msg =
    status === "connected"
      ? "Google conectado com sucesso. Você pode fechar esta aba e voltar ao Sinal."
      : status === "denied"
        ? "Conexão com o Google cancelada. Pode fechar esta aba."
        : "Falha ao conectar com o Google. Feche esta aba e tente novamente.";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sinal · Google</title>
<style>
  body{margin:0;background:#0B0B0F;color:#ECECF1;font-family:ui-sans-serif,system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px}
  .card{max-width:380px}
  .dot{width:42px;height:42px;border-radius:12px;margin:0 auto 16px;
       background:${status === "connected" ? "#35E0D8" : "#26262F"}}
  p{font-size:14px;line-height:1.5;color:#B8B8C2}
  button{margin-top:18px;background:#1F1F29;color:#ECECF1;border:1px solid #2B2B36;
         padding:8px 16px;border-radius:8px;font-size:13px;cursor:pointer}
</style></head><body><div class="card">
  <div class="dot"></div>
  <p>${msg}</p>
  <button onclick="window.close()">Fechar aba</button>
</div>
<script>
  try { window.opener && window.opener.postMessage({ source: "sinal-google", status: "${status}" }, "*"); } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch (e) {} }, 1200);
</script>
</body></html>`;
}

// OAuth redirect target. Runs in a first-party tab WITHOUT a session cookie, so
// it resolves the tenant from the server-side state row (no requireAuth here).
router.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  res.type("html");

  if (error) {
    res.send(callbackPage("denied"));
    return;
  }
  if (!code || !state) {
    res.send(callbackPage("error"));
    return;
  }

  const st = await pool.query(
    `delete from google_oauth_states
      where state = $1 returning tenant_id, expires_at`,
    [state],
  );
  const row = st.rows[0] as
    | { tenant_id: string; expires_at: Date }
    | undefined;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    res.send(callbackPage("error"));
    return;
  }

  const creds = await getTenantGoogleCredentials(pool, row.tenant_id);
  if (!isGoogleReady(creds)) {
    res.send(callbackPage("error"));
    return;
  }
  g.applyGoogleEnv(creds);

  try {
    const tokens = await g.exchangeCode(code);
    const email = await g.getUserEmail(tokens.access_token);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    await pool.query(
      `insert into google_oauth_tokens
         (tenant_id, email, access_token, refresh_token, token_type, scope, expiry)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tenant_id) do update set
         email = excluded.email,
         access_token = excluded.access_token,
         refresh_token = coalesce(excluded.refresh_token, google_oauth_tokens.refresh_token),
         token_type = excluded.token_type,
         scope = excluded.scope,
         expiry = excluded.expiry,
         updated_at = now()`,
      [
        row.tenant_id,
        email,
        tokens.access_token,
        tokens.refresh_token ?? null,
        tokens.token_type ?? null,
        tokens.scope ?? null,
        expiry,
      ],
    );
    res.send(callbackPage("connected"));
  } catch (err) {
    req.log?.error({ err }, "google callback failed");
    res.send(callbackPage("error"));
  }
});

// Everything below requires an authenticated app session (XHR from the iframe).
router.use(requireAuth);
router.use(async (req: AuthedRequest, _res, next) => {
  try {
    await syncGoogleFromTenant(req.auth!.tenantId);
    next();
  } catch (e) {
    next(e);
  }
});

router.put("/google/credentials", requireOwnerTenant, async (req: AuthedRequest, res) => {
  const parsed = googleCredentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials" });
    return;
  }

  let saved;
  try {
    saved = await saveTenantGoogleCredentials(pool, req.auth!.tenantId, {
      clientId: parsed.data.clientId.trim(),
      clientSecret: parsed.data.clientSecret.trim(),
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "invalid_client_id" || msg === "invalid_client_secret") {
      res.status(400).json({ error: msg });
      return;
    }
    if (msg === "credential_persist_failed") {
      res.status(500).json({ error: "credential_persist_failed" });
      return;
    }
    if (msg.includes("SESSION_SECRET")) {
      res.status(500).json({ error: "session_secret_required" });
      return;
    }
    throw e;
  }

  g.applyGoogleEnv(saved);

  let envPath: string | null = null;
  try {
    envPath = upsertEnvVars({
      GOOGLE_CLIENT_ID: saved.clientId,
      GOOGLE_CLIENT_SECRET: saved.clientSecret,
    });
  } catch (e) {
    req.log.error({ err: e }, "failed to write .env");
    res.status(500).json({
      error: "env_write_failed",
      message: "Credenciais criptografadas no banco, mas falhou ao atualizar o .env.",
      storedInDb: true,
    });
    return;
  }

  res.json({
    ok: true,
    configured: true,
    clientIdMasked: maskGoogleClientId(saved.clientId),
    envUpdated: true,
    storedInDb: true,
    envFilePath: envPath,
    redirectUri: g.googleRedirectUri(),
  });
});

// Connection status for the current tenant.
router.get("/google/status", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const creds = await getTenantGoogleCredentials(pool, t);
  const storedInDb = await hasStoredGoogleCredentials(pool, t);
  const { rows } = await pool.query(
    `select email, scope, refresh_token
       from google_oauth_tokens where tenant_id = $1`,
    [t],
  );
  const row = rows[0] as { email?: string; scope?: string } | undefined;
  res.json({
    configured: isGoogleReady(creds),
    redirectUri: g.googleRedirectUri(),
    clientIdMasked: maskGoogleClientId(creds?.clientId),
    storedInDb,
    envFilePath: envFilePath(),
    connected: !!row,
    email: row?.email ?? null,
    contacts: row ? g.hasContactsScope(row.scope) : false,
    calendar: row ? g.hasCalendarScope(row.scope) : false,
  });
});

const connectBodySchema = z.object({
  service: z.enum(["contacts", "calendar", "all"]).optional(),
});

// Create a one-time state row and return the Google consent URL. The frontend
// opens this URL in a real tab (Google cannot be framed).
router.post("/google/connect-url", async (req: AuthedRequest, res) => {
  const creds = await getTenantGoogleCredentials(pool, req.auth!.tenantId);
  if (!isGoogleReady(creds)) {
    res.status(503).json({ error: "google_not_configured" });
    return;
  }
  const parsed = connectBodySchema.safeParse(req.body ?? {});
  const service = parsed.success ? (parsed.data.service ?? "contacts") : "contacts";
  const t = req.auth!.tenantId;
  const state = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await pool.query(
    `delete from google_oauth_states where tenant_id = $1 and expires_at < now()`,
    [t],
  );
  await pool.query(
    `insert into google_oauth_states (state, tenant_id, user_id, email, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [state, t, req.auth!.userId, req.auth!.email, expiresAt],
  );
  res.json({ url: g.buildAuthUrl(state, service) });
});

// Disconnect: remove stored tokens for the tenant.
router.post("/google/disconnect", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  await pool.query(`delete from google_oauth_tokens where tenant_id = $1`, [t]);
  res.json({ ok: true });
});

// Import Google connections into the CRM. Matches existing contacts by the last
// 8 digits of the phone number; otherwise creates a new contact.
router.post("/google/import", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  let accessToken: string;
  try {
    accessToken = await g.getValidAccessToken(t);
  } catch {
    res.status(409).json({ error: "google_not_connected" });
    return;
  }

  const people = await g.listConnections(accessToken);
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const person of people) {
    const phones = (person.phoneNumbers ?? [])
      .map((p) => g.normalizePhone(p.value))
      .filter((p) => p.length >= 8);
    if (phones.length === 0) {
      skipped++;
      continue;
    }
    const name = person.names?.[0]?.displayName ?? null;
    const email = person.emailAddresses?.[0]?.value ?? null;
    const primaryPhone = (person.phoneNumbers?.[0]?.value ?? null)?.trim() ?? null;
    const suffixes = phones.map((p) => p.slice(-8));

    const match = await pool.query(
      `select id, display_name, email from contacts
        where tenant_id = $1
          and length(regexp_replace(coalesce(primary_phone,''), '\\D', '', 'g')) >= 8
          and right(regexp_replace(coalesce(primary_phone,''), '\\D', '', 'g'), 8) = any($2)
        limit 1`,
      [t, suffixes],
    );

    if (match.rows.length > 0) {
      const c = match.rows[0] as { id: string };
      await pool.query(
        `update contacts set
            display_name = coalesce(nullif(display_name, ''), $2),
            email = coalesce(nullif(email, ''), $3),
            google_resource_name = $4,
            updated_at = now()
          where id = $1 and tenant_id = $5`,
        [c.id, name, email, person.resourceName, t],
      );
      updated++;
    } else {
      await pool.query(
        `insert into contacts
           (tenant_id, display_name, email, primary_phone, google_resource_name, source)
         values ($1, $2, $3, $4, $5, 'google')`,
        [t, name ?? primaryPhone, email, primaryPhone, person.resourceName],
      );
      imported++;
    }
  }

  res.json({ imported, updated, skipped, total: people.length });
});

// Export a single CRM contact to Google Contacts (create or update).
router.post("/google/contacts/:id/export", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const c = await pool.query(
    `select id, display_name, email, primary_phone, google_resource_name
       from contacts where id = $1 and tenant_id = $2`,
    [req.params.id, t],
  );
  if (c.rows.length === 0) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const contact = c.rows[0] as {
    id: string;
    display_name: string | null;
    email: string | null;
    primary_phone: string | null;
    google_resource_name: string | null;
  };

  let accessToken: string;
  try {
    accessToken = await g.getValidAccessToken(t);
  } catch {
    res.status(409).json({ error: "google_not_connected" });
    return;
  }

  const input = {
    name: contact.display_name,
    email: contact.email,
    phone: contact.primary_phone,
  };

  if (contact.google_resource_name) {
    await g.updateContact(accessToken, contact.google_resource_name, input);
    res.json({ ok: true, resourceName: contact.google_resource_name });
  } else {
    const resourceName = await g.createContact(accessToken, input);
    await pool.query(
      `update contacts set google_resource_name = $2, updated_at = now()
        where id = $1 and tenant_id = $3`,
      [contact.id, resourceName, t],
    );
    res.json({ ok: true, resourceName });
  }
});

// Upcoming calendar events (requires calendar scope on the stored token).
router.get("/google/calendar/events", async (req: AuthedRequest, res) => {
  const t = req.auth!.tenantId;
  const days = Math.min(Number(req.query.days ?? 14), 60);
  const limit = Math.min(Number(req.query.limit ?? 30), 100);

  const tokenRow = await pool.query<{ scope: string | null }>(
    `select scope from google_oauth_tokens where tenant_id = $1`,
    [t],
  );
  if (tokenRow.rows.length === 0) {
    res.status(409).json({ error: "google_not_connected" });
    return;
  }
  if (!g.hasCalendarScope(tokenRow.rows[0]?.scope)) {
    res.status(409).json({ error: "google_calendar_not_connected" });
    return;
  }

  let accessToken: string;
  try {
    accessToken = await g.getValidAccessToken(t);
  } catch {
    res.status(409).json({ error: "google_not_connected" });
    return;
  }

  const events = await listUpcomingCalendarEvents(accessToken, {
    days,
    maxResults: limit,
  });
  res.json({ events, days, count: events.length });
});

export default router;
