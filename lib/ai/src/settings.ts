/** How the tenant picks OpenRouter models from the admin panel. */
export type AiSelectionMode =
  | "auto_free"
  | "pick_free"
  | "pick_paid"
  | "by_task";

/** Pipeline task types that call an LLM (or multimodal model). */
export type AiTaskType =
  | "classify"
  | "cluster"
  | "mentions"
  | "contact_analysis"
  | "audio"
  | "image"
  | "video";

export const AI_TASK_TYPES: AiTaskType[] = [
  "classify",
  "cluster",
  "mentions",
  "contact_analysis",
  "audio",
  "image",
  "video",
];

export const AI_TASK_LABELS: Record<AiTaskType, string> = {
  classify: "Classificação de mensagens",
  cluster: "Agrupamento de pautas",
  mentions: "Detecção de menções",
  contact_analysis: "Análise de contatos",
  audio: "Áudio (transcrição)",
  image: "Imagem (OCR / visão)",
  video: "Vídeo",
};

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface TenantAiSettings {
  mode: AiSelectionMode;
  /** Used when mode = pick_free */
  selectedFreeModels: string[];
  /** Used when mode = pick_paid */
  selectedPaidModels: string[];
  /** Used when mode = by_task */
  byTask: Partial<Record<AiTaskType, string>>;
}

/** Stored in DB config JSON — never returned in full to the client. */
export interface TenantOpenRouterCredentials {
  apiKey: string;
  baseUrl: string;
}

export const DEFAULT_TENANT_AI_SETTINGS: TenantAiSettings = {
  mode: "auto_free",
  selectedFreeModels: [],
  selectedPaidModels: [],
  byTask: {},
};

/** Curated free models, best-first for auto mode (text tasks). */
export const AUTO_FREE_TEXT_MODELS = [
  "deepseek/deepseek-chat-v3-0324",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-7b-instruct:free",
] as const;

export const AUTO_FREE_BY_TASK: Partial<Record<AiTaskType, string[]>> = {
  classify: [...AUTO_FREE_TEXT_MODELS],
  cluster: [...AUTO_FREE_TEXT_MODELS],
  mentions: [...AUTO_FREE_TEXT_MODELS],
  contact_analysis: [...AUTO_FREE_TEXT_MODELS],
  audio: [
    "google/gemini-2.0-flash-exp:free",
    "openai/whisper-1",
  ],
  image: [
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
  ],
  video: ["google/gemini-2.0-flash-exp:free"],
};

export function parseTenantAiSettings(raw: unknown): TenantAiSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TENANT_AI_SETTINGS };
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  const validMode =
    mode === "auto_free" ||
    mode === "pick_free" ||
    mode === "pick_paid" ||
    mode === "by_task"
      ? mode
      : "auto_free";
  return {
    mode: validMode,
    selectedFreeModels: Array.isArray(o.selectedFreeModels)
      ? o.selectedFreeModels.map(String).filter(Boolean)
      : [],
    selectedPaidModels: Array.isArray(o.selectedPaidModels)
      ? o.selectedPaidModels.map(String).filter(Boolean)
      : [],
    byTask:
      o.byTask && typeof o.byTask === "object"
        ? (o.byTask as Partial<Record<AiTaskType, string>>)
        : {},
  };
}

const ENV_KEYS: Record<AiTaskType, string> = {
  classify: "CLASSIFY_MODEL",
  cluster: "CLUSTER_MODEL",
  mentions: "MENTIONS_MODEL",
  contact_analysis: "CONTACT_ANALYSIS_MODEL",
  audio: "AUDIO_MODEL",
  image: "IMAGE_MODEL",
  video: "VIDEO_MODEL",
};

/** Map resolved models into env vars consumed by pipeline scripts. */
export function modelsToEnv(
  models: Partial<Record<AiTaskType, string>>,
): Record<string, string> {
  const env: Record<string, string> = {
    CLASSIFY_PROVIDER: "openrouter",
  };
  for (const task of AI_TASK_TYPES) {
    const model = models[task];
    if (model) env[ENV_KEYS[task]] = model;
  }
  if (models.classify) env.CLASSIFY_MODEL = models.classify;
  return env;
}
