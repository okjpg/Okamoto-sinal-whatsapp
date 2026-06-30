import type { Pool } from "pg";
import { decryptSecret, encryptSecret } from "./secrets-crypto";
import { DEFAULT_TENANT_AI_SETTINGS } from "@workspace/ai";

function readEnvSecure(port: number): boolean {
  const smtpSecure = process.env.SMTP_SECURE?.trim().toLowerCase();
  if (smtpSecure === "1" || smtpSecure === "true") return true;
  if (smtpSecure === "0" || smtpSecure === "false") return false;

  const enc =
    process.env.MAIL_ENCRYPTION?.trim().toLowerCase() ??
    process.env.SMTP_ENCRYPTION?.trim().toLowerCase();
  if (enc === "ssl" || enc === "smtps") return port === 465;
  if (enc === "tls" || enc === "starttls") return false;

  return port === 465;
}

function readEnvPort(): number {
  const raw = process.env.SMTP_PORT ?? process.env.MAIL_PORT ?? "587";
  const port = Number(String(raw).replace(/"/g, "").trim()) || 587;
  return port;
}

export interface TenantSmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

type ConfigJson = Record<string, unknown>;

interface SettingsRow {
  mode: string;
  config: unknown;
}

async function ensureTenant(pool: Pool, tenantId: string): Promise<void> {
  await pool.query(
    `insert into tenants (id, name) values ($1, 'Sinal')
     on conflict (id) do nothing`,
    [tenantId],
  );
}

async function readRow(
  pool: Pool,
  tenantId: string,
): Promise<{ mode: string; config: ConfigJson } | null> {
  const { rows } = await pool.query<SettingsRow>(
    `select mode, config from tenant_ai_settings where tenant_id = $1`,
    [tenantId],
  );
  if (!rows[0]) return null;
  const config =
    rows[0].config && typeof rows[0].config === "object"
      ? (rows[0].config as ConfigJson)
      : {};
  return { mode: rows[0].mode, config };
}

function readPasswordFromConfig(config: ConfigJson): string | null {
  const enc =
    typeof config.smtpPasswordEnc === "string"
      ? config.smtpPasswordEnc.trim()
      : "";
  if (enc) {
    try {
      return decryptSecret(enc);
    } catch {
      return null;
    }
  }
  const legacy =
    typeof config.smtpPassword === "string" ? config.smtpPassword.trim() : "";
  return legacy || null;
}

export function maskSmtpUser(user: string | null | undefined): string | null {
  if (!user?.trim()) return null;
  const u = user.trim();
  const at = u.indexOf("@");
  if (at <= 1) return `${u.slice(0, 2)}…`;
  return `${u.slice(0, 2)}…${u.slice(at)}`;
}

export async function getTenantSmtpSettings(
  pool: Pool,
  tenantId: string,
): Promise<TenantSmtpSettings | null> {
  const row = await readRow(pool, tenantId);
  const config = row?.config ?? {};
  const host =
    typeof config.smtpHost === "string" ? config.smtpHost.trim() : "";
  const fromEmail =
    typeof config.smtpFromEmail === "string" ? config.smtpFromEmail.trim() : "";
  const password = readPasswordFromConfig(config);
  const user =
    typeof config.smtpUser === "string" ? config.smtpUser.trim() : "";

  if (host && fromEmail && password) {
    return {
      host,
      port:
        typeof config.smtpPort === "number"
          ? config.smtpPort
          : Number(config.smtpPort ?? 587) || 587,
      secure: config.smtpSecure === true || config.smtpSecure === "true",
      user,
      password,
      fromEmail,
      fromName:
        typeof config.smtpFromName === "string" && config.smtpFromName.trim()
          ? config.smtpFromName.trim()
          : "Sinal",
    };
  }

  const envHost =
    process.env.SMTP_HOST?.trim().replace(/^["']|["']$/g, "") ??
    process.env.MAIL_HOST?.trim().replace(/^["']|["']$/g, "");
  const envPass =
    process.env.SMTP_PASS?.trim().replace(/^["']|["']$/g, "") ??
    process.env.SMTP_PASSWORD?.trim().replace(/^["']|["']$/g, "") ??
    process.env.MAIL_PASSWORD?.trim().replace(/^["']|["']$/g, "");
  const envFrom =
    process.env.SMTP_FROM?.trim().replace(/^["']|["']$/g, "") ??
    process.env.MAIL_FROM_ADDRESS?.trim().replace(/^["']|["']$/g, "");
  if (envHost && envPass && envFrom) {
    const port = readEnvPort();
    return {
      host: envHost,
      port,
      secure: readEnvSecure(port),
      user:
        process.env.SMTP_USER?.trim().replace(/^["']|["']$/g, "") ??
        process.env.MAIL_USERNAME?.trim().replace(/^["']|["']$/g, "") ??
        "",
      password: envPass,
      fromEmail: envFrom,
      fromName:
        process.env.SMTP_FROM_NAME?.trim().replace(/^["']|["']$/g, "") ??
        process.env.MAIL_FROM_NAME?.trim().replace(/^["']|["']$/g, "") ??
        "Sinal",
    };
  }

  return null;
}

export async function saveTenantSmtpSettings(
  pool: Pool,
  tenantId: string,
  settings: TenantSmtpSettings,
): Promise<TenantSmtpSettings> {
  const host = settings.host.trim();
  const fromEmail = settings.fromEmail.trim();
  const password = settings.password.trim();
  const user = settings.user.trim();
  const port = settings.port > 0 ? settings.port : 587;
  const fromName = settings.fromName.trim() || "Sinal";

  if (!host || !fromEmail || !password) {
    throw new Error("invalid_smtp_settings");
  }

  await ensureTenant(pool, tenantId);
  const row = await readRow(pool, tenantId);
  const prev = row?.config ?? {};
  const mode = row?.mode ?? DEFAULT_TENANT_AI_SETTINGS.mode;
  const config: ConfigJson = {
    ...prev,
    smtpHost: host,
    smtpPort: port,
    smtpSecure: settings.secure,
    smtpUser: user,
    smtpPasswordEnc: encryptSecret(password),
    smtpFromEmail: fromEmail,
    smtpFromName: fromName,
  };
  delete config.smtpPassword;

  await pool.query(
    `insert into tenant_ai_settings (tenant_id, mode, config, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (tenant_id) do update
       set config = excluded.config,
           updated_at = now()`,
    [tenantId, mode, JSON.stringify(config)],
  );

  return { host, port, secure: settings.secure, user, password, fromEmail, fromName };
}

export async function hasStoredSmtpSettings(
  pool: Pool,
  tenantId: string,
): Promise<boolean> {
  const row = await readRow(pool, tenantId);
  if (!row) return false;
  const host =
    typeof row.config.smtpHost === "string" ? row.config.smtpHost.trim() : "";
  return Boolean(host && readPasswordFromConfig(row.config));
}

export function isSmtpReady(settings: TenantSmtpSettings | null): boolean {
  return Boolean(settings?.host && settings.fromEmail && settings.password);
}
