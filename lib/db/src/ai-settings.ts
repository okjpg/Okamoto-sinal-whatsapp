import type { Pool } from "pg";
import {
  DEFAULT_TENANT_AI_SETTINGS,
  OPENROUTER_DEFAULT_BASE_URL,
  fetchOpenRouterModels,
  modelsToEnv,
  parseTenantAiSettings,
  resolveModelsForSettings,
  type TenantAiSettings,
  type TenantOpenRouterCredentials,
} from "@workspace/ai";
import { decryptSecret, encryptSecret, maskSecret } from "./secrets-crypto";

export { maskSecret };

interface SettingsRow {
  mode: string;
  config: unknown;
}

type ConfigJson = Record<string, unknown>;

const MVP_TENANT_ID = "00000000-0000-0000-0000-000000000001";

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

function readApiKeyFromConfig(config: ConfigJson): string | null {
  const enc =
    typeof config.openrouterApiKeyEnc === "string"
      ? config.openrouterApiKeyEnc.trim()
      : "";
  if (enc) {
    try {
      return decryptSecret(enc);
    } catch {
      return null;
    }
  }
  const legacy =
    typeof config.openrouterApiKey === "string"
      ? config.openrouterApiKey.trim()
      : "";
  return legacy || null;
}

function configToSettings(
  mode: string,
  config: ConfigJson,
): TenantAiSettings {
  return parseTenantAiSettings({ mode, ...config });
}

export async function getTenantAiSettings(
  pool: Pool,
  tenantId: string,
): Promise<TenantAiSettings> {
  const row = await readRow(pool, tenantId);
  if (!row) return { ...DEFAULT_TENANT_AI_SETTINGS };
  return configToSettings(row.mode, row.config);
}

export async function getTenantOpenRouterCredentials(
  pool: Pool,
  tenantId: string,
): Promise<TenantOpenRouterCredentials | null> {
  const row = await readRow(pool, tenantId);
  const fromDb = row ? readApiKeyFromConfig(row.config) : null;
  if (fromDb) {
    const base =
      typeof row?.config.openrouterBaseUrl === "string" &&
      row.config.openrouterBaseUrl.trim()
        ? row.config.openrouterBaseUrl.trim()
        : OPENROUTER_DEFAULT_BASE_URL;
    return { apiKey: fromDb, baseUrl: base };
  }

  const envKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY?.trim();
  const envBase =
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL?.trim() ??
    OPENROUTER_DEFAULT_BASE_URL;
  if (envKey) return { apiKey: envKey, baseUrl: envBase };

  return null;
}

export async function saveTenantAiSettings(
  pool: Pool,
  tenantId: string,
  settings: TenantAiSettings,
): Promise<TenantAiSettings> {
  await ensureTenant(pool, tenantId);
  const row = await readRow(pool, tenantId);
  const prev = row?.config ?? {};
  const config: ConfigJson = {
    ...prev,
    selectedFreeModels: settings.selectedFreeModels,
    selectedPaidModels: settings.selectedPaidModels,
    byTask: settings.byTask,
  };
  await pool.query(
    `insert into tenant_ai_settings (tenant_id, mode, config, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (tenant_id) do update
       set mode = excluded.mode,
           config = excluded.config,
           updated_at = now()`,
    [tenantId, settings.mode, JSON.stringify(config)],
  );
  return settings;
}

export async function saveTenantOpenRouterCredentials(
  pool: Pool,
  tenantId: string,
  creds: TenantOpenRouterCredentials,
): Promise<TenantOpenRouterCredentials> {
  const apiKey = creds.apiKey.trim();
  const baseUrl = (creds.baseUrl?.trim() || OPENROUTER_DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  if (!apiKey.startsWith("sk-")) {
    throw new Error("invalid_api_key_format");
  }

  await ensureTenant(pool, tenantId);

  const encrypted = encryptSecret(apiKey);
  const row = await readRow(pool, tenantId);
  const prev = row?.config ?? {};
  const mode = row?.mode ?? DEFAULT_TENANT_AI_SETTINGS.mode;
  const config: ConfigJson = {
    ...prev,
    openrouterApiKeyEnc: encrypted,
    openrouterBaseUrl: baseUrl,
  };
  delete config.openrouterApiKey;

  await pool.query(
    `insert into tenant_ai_settings (tenant_id, mode, config, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (tenant_id) do update
       set config = excluded.config,
           updated_at = now()`,
    [tenantId, mode, JSON.stringify(config)],
  );

  const verify = await readRow(pool, tenantId);
  const roundTrip = verify ? readApiKeyFromConfig(verify.config) : null;
  if (roundTrip !== apiKey) {
    throw new Error("credential_persist_failed");
  }

  return { apiKey, baseUrl };
}

/** Env vars for pipeline scripts from tenant panel settings + OpenRouter key. */
export async function buildTenantAiEnv(
  pool: Pool,
  tenantId: string,
): Promise<Record<string, string>> {
  const creds = await getTenantOpenRouterCredentials(pool, tenantId);
  if (!creds) return {};

  const settings = await getTenantAiSettings(pool, tenantId);
  let catalog;
  try {
    catalog = await fetchOpenRouterModels();
  } catch {
    catalog = [];
  }
  const models = resolveModelsForSettings(settings, catalog);
  return {
    ...modelsToEnv(models),
    AI_INTEGRATIONS_OPENROUTER_API_KEY: creds.apiKey,
    AI_INTEGRATIONS_OPENROUTER_BASE_URL: creds.baseUrl,
    CLASSIFY_PROVIDER: "openrouter",
  };
}

export function isOpenRouterReady(
  creds: TenantOpenRouterCredentials | null,
): boolean {
  return Boolean(creds?.apiKey && creds.baseUrl);
}

export async function hasStoredOpenRouterCredentials(
  pool: Pool,
  tenantId: string,
): Promise<boolean> {
  const row = await readRow(pool, tenantId);
  if (!row) return false;
  return Boolean(readApiKeyFromConfig(row.config));
}

export interface TenantGoogleCredentials {
  clientId: string;
  clientSecret: string;
}

function readGoogleSecretFromConfig(config: ConfigJson): string | null {
  const enc =
    typeof config.googleClientSecretEnc === "string"
      ? config.googleClientSecretEnc.trim()
      : "";
  if (enc) {
    try {
      return decryptSecret(enc);
    } catch {
      return null;
    }
  }
  const legacy =
    typeof config.googleClientSecret === "string"
      ? config.googleClientSecret.trim()
      : "";
  return legacy || null;
}

export function maskGoogleClientId(clientId: string | null | undefined): string | null {
  if (!clientId?.trim()) return null;
  const id = clientId.trim();
  if (id.length <= 16) return `${id.slice(0, 4)}…`;
  return `${id.slice(0, 8)}…${id.slice(-20)}`;
}

export async function getTenantGoogleCredentials(
  pool: Pool,
  tenantId: string,
): Promise<TenantGoogleCredentials | null> {
  const row = await readRow(pool, tenantId);
  const fromDbId =
    row && typeof row.config.googleClientId === "string"
      ? row.config.googleClientId.trim()
      : "";
  const fromDbSecret = row ? readGoogleSecretFromConfig(row.config) : null;
  if (fromDbId && fromDbSecret) {
    return { clientId: fromDbId, clientSecret: fromDbSecret };
  }

  const envId = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  return null;
}

export async function saveTenantGoogleCredentials(
  pool: Pool,
  tenantId: string,
  creds: TenantGoogleCredentials,
): Promise<TenantGoogleCredentials> {
  const clientId = creds.clientId.trim();
  const clientSecret = creds.clientSecret.trim();
  if (!clientId || clientId.length < 12) {
    throw new Error("invalid_client_id");
  }
  if (!clientSecret || clientSecret.length < 8) {
    throw new Error("invalid_client_secret");
  }

  await ensureTenant(pool, tenantId);

  const encrypted = encryptSecret(clientSecret);
  const row = await readRow(pool, tenantId);
  const prev = row?.config ?? {};
  const mode = row?.mode ?? DEFAULT_TENANT_AI_SETTINGS.mode;
  const config: ConfigJson = {
    ...prev,
    googleClientId: clientId,
    googleClientSecretEnc: encrypted,
  };
  delete config.googleClientSecret;

  await pool.query(
    `insert into tenant_ai_settings (tenant_id, mode, config, updated_at)
     values ($1, $2, $3::jsonb, now())
     on conflict (tenant_id) do update
       set config = excluded.config,
           updated_at = now()`,
    [tenantId, mode, JSON.stringify(config)],
  );

  const verify = await readRow(pool, tenantId);
  const roundTripId =
    verify && typeof verify.config.googleClientId === "string"
      ? verify.config.googleClientId.trim()
      : "";
  const roundTripSecret = verify
    ? readGoogleSecretFromConfig(verify.config)
    : null;
  if (roundTripId !== clientId || roundTripSecret !== clientSecret) {
    throw new Error("credential_persist_failed");
  }

  return { clientId, clientSecret };
}

export async function hasStoredGoogleCredentials(
  pool: Pool,
  tenantId: string,
): Promise<boolean> {
  const row = await readRow(pool, tenantId);
  if (!row) return false;
  const id =
    typeof row.config.googleClientId === "string"
      ? row.config.googleClientId.trim()
      : "";
  return Boolean(id && readGoogleSecretFromConfig(row.config));
}

export function isGoogleReady(creds: TenantGoogleCredentials | null): boolean {
  return Boolean(creds?.clientId && creds?.clientSecret);
}

export { MVP_TENANT_ID as AI_SETTINGS_TENANT_FALLBACK };