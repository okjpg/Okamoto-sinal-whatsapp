export interface EvolutionConfig {
  base: string;
  apiKey: string;
  instance: string;
}

export interface EvolutionQrcodeResult {
  base64: string | null;
  pairingCode: string | null;
}

export interface EvolutionInstanceInfo {
  name: string;
  status: string;
}

const INSTANCE_RE = /^[a-zA-Z0-9_-]{3,40}$/;

export function resolveInstanceName(raw?: string | null): string {
  const name = (raw ?? process.env.EVOLUTION_INSTANCE ?? "sinal").trim();
  if (!INSTANCE_RE.test(name)) {
    throw new Error("invalid_instance_name");
  }
  return name;
}

export function getSuggestedInstanceName(ownerPhone: string): string {
  const envName = process.env.EVOLUTION_INSTANCE ?? "sinal";
  if (envName !== "sinal") return envName;
  return `sinal-${ownerPhone}`;
}

export function getEvolutionConfig(instanceOverride?: string): EvolutionConfig | null {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!base || !apiKey) return null;
  try {
    return {
      base,
      apiKey,
      instance: resolveInstanceName(instanceOverride),
    };
  } catch {
    return null;
  }
}

export function evolutionWebhookUrl(): string | null {
  if (process.env.EVOLUTION_WEBHOOK_URL) {
    return process.env.EVOLUTION_WEBHOOK_URL;
  }
  const publicUrl = process.env.SINAL_PUBLIC_URL?.replace(/\/$/, "");
  if (publicUrl) return `${publicUrl}/api/evolution/webhook`;
  return null;
}

export async function evolutionFetch(
  cfg: EvolutionConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${cfg.base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.apiKey,
      ...(init?.headers ?? {}),
    },
  });
}

function normalizeBase64(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  return `data:image/png;base64,${raw}`;
}

export function extractQrcodeFromBody(
  body: Record<string, unknown>,
): EvolutionQrcodeResult {
  const qrcode = body.qrcode as Record<string, unknown> | undefined;
  const base64Raw =
    (body.base64 as string | undefined) ??
    (qrcode?.base64 as string | undefined) ??
    null;
  const pairingCode =
    (body.pairingCode as string | undefined) ??
    (qrcode?.pairingCode as string | undefined) ??
    null;
  return {
    base64: normalizeBase64(base64Raw),
    pairingCode,
  };
}

function parseInstanceRows(body: unknown): EvolutionInstanceInfo[] {
  if (!body || typeof body !== "object") return [];
  const arr = Array.isArray(body)
    ? body
    : Array.isArray((body as { instances?: unknown[] }).instances)
      ? (body as { instances: unknown[] }).instances
      : Array.isArray((body as { response?: unknown[] }).response)
        ? (body as { response: unknown[] }).response
        : [];
  return arr
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const inst = r.instance as Record<string, unknown> | undefined;
      const name = String(
        r.instanceName ?? r.name ?? inst?.instanceName ?? "",
      ).trim();
      if (!name) return null;
      const status = String(
        r.connectionStatus ??
          r.status ??
          r.state ??
          inst?.status ??
          inst?.state ??
          "unknown",
      );
      return { name, status };
    })
    .filter((x): x is EvolutionInstanceInfo => x !== null);
}

export async function fetchEvolutionInstances(
  cfg: EvolutionConfig,
): Promise<EvolutionInstanceInfo[]> {
  const res = await evolutionFetch(cfg, "/instance/fetchInstances");
  if (!res.ok) return [];
  const body = (await res.json()) as unknown;
  return parseInstanceRows(body);
}

export async function instanceExistsOnServer(
  cfg: EvolutionConfig,
): Promise<boolean> {
  const list = await fetchEvolutionInstances(cfg);
  return list.some((i) => i.name === cfg.instance);
}

export async function fetchConnectionState(
  cfg: EvolutionConfig,
): Promise<string> {
  const res = await evolutionFetch(
    cfg,
    `/instance/connectionState/${cfg.instance}`,
  );
  if (!res.ok) return "close";
  const body = (await res.json()) as {
    instance?: { state?: string; status?: string };
    state?: string;
    status?: string;
  };
  return normalizeConnectionState(
    body.instance?.state ??
      body.instance?.status ??
      body.state ??
      body.status ??
      "close",
  );
}

/** Evolution may return "open", "connected", "connecting", "close", etc. */
export function normalizeConnectionState(raw: string | undefined | null): string {
  const s = String(raw ?? "close").trim().toLowerCase();
  if (s === "connected") return "open";
  return s;
}

export function isEvolutionConnected(state: string): boolean {
  return normalizeConnectionState(state) === "open";
}

export async function createEvolutionInstance(
  cfg: EvolutionConfig,
): Promise<{
  created: boolean;
  alreadyExists: boolean;
  message: string | null;
  qrcode: EvolutionQrcodeResult;
}> {
  const res = await evolutionFetch(cfg, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: cfg.instance,
      integration: "WHATSAPP-BAILEYS",
      qrcode: false,
    }),
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text };
  }

  if (res.ok) {
    return {
      created: true,
      alreadyExists: false,
      message: null,
      qrcode: extractQrcodeFromBody(body),
    };
  }

  const response = body.response as { message?: string[] } | undefined;
  const apiMessage =
    response?.message?.join(" ") ??
    (typeof body.message === "string" ? body.message : text.slice(0, 200));

  const lower = text.toLowerCase();
  if (
    res.status === 403 ||
    res.status === 409 ||
    lower.includes("already") ||
    lower.includes("in use")
  ) {
    return {
      created: false,
      alreadyExists: true,
      message: apiMessage || "Instância já existe na Evolution.",
      qrcode: { base64: null, pairingCode: null },
    };
  }

  throw new Error(`evolution_create_failed:${res.status}:${apiMessage}`);
}

export async function deleteEvolutionInstance(
  cfg: EvolutionConfig,
): Promise<void> {
  const res = await evolutionFetch(cfg, `/instance/delete/${cfg.instance}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`evolution_delete_failed:${res.status}:${text.slice(0, 200)}`);
  }
}

export async function restartEvolutionInstance(
  cfg: EvolutionConfig,
): Promise<void> {
  const res = await evolutionFetch(cfg, `/instance/restart/${cfg.instance}`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`evolution_restart_failed:${res.status}:${text.slice(0, 200)}`);
  }
}

export async function fetchEvolutionQrcode(
  cfg: EvolutionConfig,
  phone?: string,
): Promise<EvolutionQrcodeResult> {
  const qs = phone ? `?number=${encodeURIComponent(phone)}` : "";
  const res = await evolutionFetch(
    cfg,
    `/instance/connect/${cfg.instance}${qs}`,
  );
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new Error(`evolution_connect_invalid_json:${res.status}`);
  }

  if (!res.ok) {
    throw new Error(`evolution_connect_failed:${res.status}:${text.slice(0, 200)}`);
  }

  return extractQrcodeFromBody(body);
}

export async function registerEvolutionWebhook(
  cfg: EvolutionConfig,
  webhookUrl: string,
): Promise<void> {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const res = await evolutionFetch(cfg, `/webhook/set/${cfg.instance}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        events: ["MESSAGES_UPSERT"],
        headers: secret ? { "x-webhook-secret": secret } : undefined,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`evolution_webhook_failed:${res.status}:${text.slice(0, 200)}`);
  }
}

export async function logoutEvolutionInstance(
  cfg: EvolutionConfig,
): Promise<void> {
  await evolutionFetch(cfg, `/instance/logout/${cfg.instance}`, {
    method: "DELETE",
  });
}

export async function prepareInstanceForQr(
  cfg: EvolutionConfig,
  options: { recreate?: boolean; ownerPhone?: string },
): Promise<{
  created: boolean;
  alreadyExists: boolean;
  message: string | null;
}> {
  if (options.recreate) {
    await deleteEvolutionInstance(cfg);
  }

  const created = await createEvolutionInstance(cfg);
  let state = await fetchConnectionState(cfg);

  if (created.alreadyExists && !options.recreate) {
    // Never restart an already-connected session — that drops WhatsApp to "connecting".
    if (state === "connecting") {
      await restartEvolutionInstance(cfg);
      state = await fetchConnectionState(cfg);
    }
  }

  return {
    created: created.created,
    alreadyExists: created.alreadyExists,
    message: created.message,
  };
}
