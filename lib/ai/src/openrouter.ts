import OpenAI from "openai";
import {
  AUTO_FREE_BY_TASK,
  AUTO_FREE_TEXT_MODELS,
  type AiTaskType,
  type TenantAiSettings,
} from "./settings";

export type { EnrichedOpenRouterModel, ModelUseCase } from "./model-catalog";
export { USE_CASE_LABELS, enrichAndSortModels } from "./model-catalog";

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  isFree: boolean;
  pricingPrompt: number;
  pricingCompletion: number;
  modality: string;
}

let client: OpenAI | null = null;

export function resetOpenRouterClient(): void {
  client = null;
}

export function applyOpenRouterEnv(creds: {
  apiKey: string;
  baseUrl?: string;
}): void {
  process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = creds.apiKey;
  process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL =
    creds.baseUrl?.replace(/\/$/, "") ?? "https://openrouter.ai/api/v1";
  process.env.CLASSIFY_PROVIDER = "openrouter";
  resetOpenRouterClient();
}

export function openRouterConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY &&
      process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
  );
}

export function getOpenRouterClient(): OpenAI {
  if (!client) {
    const baseURL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    if (!baseURL || !apiKey) {
      throw new Error(
        "AI_INTEGRATIONS_OPENROUTER_BASE_URL / _API_KEY are required for OpenRouter.",
      );
    }
    client = new OpenAI({ baseURL, apiKey });
  }
  return client;
}

function parsePrice(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function inferModality(m: Record<string, unknown>): string {
  const arch = m.architecture;
  if (arch && typeof arch === "object") {
    const mod = (arch as { modality?: string }).modality;
    if (mod) return mod;
  }
  const id = String(m.id ?? "").toLowerCase();
  if (id.includes("whisper") || id.includes("audio")) return "audio";
  if (id.includes("vision") || id.includes("image")) return "image->text";
  return "text->text";
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const baseURL =
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL?.replace(/\/$/, "") ??
    "https://openrouter.ai/api/v1";
  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${baseURL}/models`, { headers });
  if (!res.ok) {
    throw new Error(`OpenRouter models API: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  const data = Array.isArray(body.data) ? body.data : [];

  return data
    .map((m) => {
      const pricing = (m.pricing ?? {}) as Record<string, unknown>;
      const prompt = parsePrice(pricing.prompt);
      const completion = parsePrice(pricing.completion);
      return {
        id: String(m.id ?? ""),
        name: String(m.name ?? m.id ?? ""),
        description:
          typeof m.description === "string" ? m.description : undefined,
        contextLength:
          typeof m.context_length === "number" ? m.context_length : undefined,
        isFree: prompt === 0 && completion === 0,
        pricingPrompt: prompt,
        pricingCompletion: completion,
        modality: inferModality(m),
      };
    })
    .filter((m) => m.id.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function pickFirstAvailable(
  candidates: string[],
  catalog: OpenRouterModel[],
): string | null {
  const ids = new Set(catalog.map((m) => m.id));
  for (const c of candidates) {
    if (ids.has(c)) return c;
  }
  return null;
}

export function resolveModelsForSettings(
  settings: TenantAiSettings,
  catalog: OpenRouterModel[],
): Partial<Record<AiTaskType, string>> {
  const free = catalog.filter((m) => m.isFree);
  const paid = catalog.filter((m) => !m.isFree);
  const out: Partial<Record<AiTaskType, string>> = {};

  const resolveTask = (task: AiTaskType): string | null => {
    if (settings.mode === "by_task") {
      const picked = settings.byTask[task];
      if (picked && catalog.some((m) => m.id === picked)) return picked;
    }

    if (settings.mode === "pick_free") {
      for (const id of settings.selectedFreeModels) {
        if (free.some((m) => m.id === id)) return id;
      }
      return pickFirstAvailable([...AUTO_FREE_TEXT_MODELS], free);
    }

    if (settings.mode === "pick_paid") {
      for (const id of settings.selectedPaidModels) {
        if (paid.some((m) => m.id === id)) return id;
      }
      return paid[0]?.id ?? null;
    }

    // auto_free
    const ranked = AUTO_FREE_BY_TASK[task] ?? [...AUTO_FREE_TEXT_MODELS];
    return pickFirstAvailable(ranked, free) ?? free[0]?.id ?? null;
  };

  for (const task of [
    "classify",
    "cluster",
    "mentions",
    "contact_analysis",
    "audio",
    "image",
    "video",
  ] as AiTaskType[]) {
    const model = resolveTask(task);
    if (model) out[task] = model;
  }
  return out;
}

export function modelForTask(task: AiTaskType): string {
  const envKey =
    task === "classify"
      ? "CLASSIFY_MODEL"
      : task === "cluster"
        ? "CLUSTER_MODEL"
        : task === "mentions"
          ? "MENTIONS_MODEL"
          : task === "contact_analysis"
            ? "CONTACT_ANALYSIS_MODEL"
            : task === "audio"
              ? "AUDIO_MODEL"
              : task === "image"
                ? "IMAGE_MODEL"
                : "VIDEO_MODEL";

  const fromEnv = process.env[envKey] ?? process.env.CLASSIFY_MODEL;
  if (fromEnv) return fromEnv;

  if (process.env.CLASSIFY_PROVIDER === "openrouter") {
    return "deepseek/deepseek-chat-v3-0324";
  }
  return "gpt-4.1-mini";
}

export function useOpenRouterForTask(): boolean {
  return (
    process.env.CLASSIFY_PROVIDER === "openrouter" || openRouterConfigured()
  );
}

export function getAiClient(): OpenAI {
  if (useOpenRouterForTask()) return getOpenRouterClient();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required.");
  return new OpenAI({ apiKey });
}

export interface OpenRouterConnectionTest {
  ok: boolean;
  storedInDb: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
  modelsCount?: number;
  freeCount?: number;
  paidCount?: number;
  latencyMs?: number;
  label?: string | null;
  error?: string;
  message?: string;
}

/** Verify API key against OpenRouter (models + optional auth/key). */
export async function testOpenRouterConnection(creds: {
  apiKey: string;
  baseUrl: string;
}): Promise<OpenRouterConnectionTest> {
  const base = creds.baseUrl.replace(/\/$/, "");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${creds.apiKey}`,
  };

  const start = Date.now();
  const modelsRes = await fetch(`${base}/models`, { headers });
  if (!modelsRes.ok) {
    const text = await modelsRes.text().catch(() => "");
    return {
      ok: false,
      storedInDb: false,
      apiKeyMasked: null,
      baseUrl: base,
      error: "models_api_failed",
      message: `HTTP ${modelsRes.status}${text ? `: ${text.slice(0, 120)}` : ""}`,
    };
  }

  const body = (await modelsRes.json()) as { data?: unknown[] };
  const modelsCount = Array.isArray(body.data) ? body.data.length : 0;
  const latencyMs = Date.now() - start;

  let label: string | null = null;
  try {
    const authRes = await fetch(`${base}/auth/key`, { headers });
    if (authRes.ok) {
      const auth = (await authRes.json()) as {
        data?: { label?: string };
      };
      label = auth.data?.label ?? null;
    }
  } catch {
    /* optional */
  }

  const allModels = await fetchOpenRouterModelsWithCreds(creds);
  return {
    ok: true,
    storedInDb: false,
    apiKeyMasked: null,
    baseUrl: base,
    modelsCount,
    freeCount: allModels.filter((m) => m.isFree).length,
    paidCount: allModels.filter((m) => !m.isFree).length,
    latencyMs,
    label,
  };
}

/** Fetch models using explicit creds (does not mutate process.env). */
export async function fetchOpenRouterModelsWithCreds(creds: {
  apiKey: string;
  baseUrl: string;
}): Promise<OpenRouterModel[]> {
  const prevKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const prevBase = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  applyOpenRouterEnv(creds);
  try {
    return await fetchOpenRouterModels();
  } finally {
    if (prevKey) process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY = prevKey;
    else delete process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
    if (prevBase) process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL = prevBase;
    else delete process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
    resetOpenRouterClient();
  }
}
