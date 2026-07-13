import type { OpenRouterModel } from "./openrouter";

export type ModelUseCase =
  | "classificacao_massa"
  | "rapido_volume"
  | "chat_geral"
  | "visao_imagem"
  | "audio"
  | "video"
  | "codigo"
  | "outro";

export const USE_CASE_LABELS: Record<ModelUseCase, string> = {
  classificacao_massa: "Classificação em massa",
  rapido_volume: "Rápido / alto volume",
  chat_geral: "Chat geral",
  visao_imagem: "Imagem / visão",
  audio: "Áudio / transcrição",
  video: "Vídeo",
  codigo: "Código",
  outro: "Uso geral",
};

/** Known paid models, best-first (OpenRouter slugs, prefix match). */
const PAID_QUALITY_ORDER: string[] = [
  "anthropic/claude-opus-4",
  "anthropic/claude-3.7-sonnet",
  "anthropic/claude-3.5-sonnet",
  "openai/o1",
  "openai/o3",
  "openai/gpt-4o",
  "openai/gpt-4.1",
  "google/gemini-2.5-pro",
  "google/gemini-2.0-pro",
  "google/gemini-pro",
  "meta-llama/llama-3.3-70b-instruct",
  "meta-llama/llama-3.1-405b",
  "deepseek/deepseek-r1",
  "deepseek/deepseek-chat",
  "mistralai/mistral-large",
  "qwen/qwen-2.5-72b-instruct",
  "cohere/command-r-plus",
];

function paidTierIndex(id: string): number {
  const lower = id.toLowerCase();
  for (let i = 0; i < PAID_QUALITY_ORDER.length; i++) {
    if (lower.startsWith(PAID_QUALITY_ORDER[i]!.toLowerCase())) return i;
  }
  return PAID_QUALITY_ORDER.length + 100;
}

/** Format OpenRouter per-token USD price as $/1M tokens. */
export function formatPricePerMillion(pricePerToken: number): string {
  if (pricePerToken <= 0) return "Grátis";
  const perM = pricePerToken * 1_000_000;
  if (perM < 0.01) return `$${perM.toFixed(4)}/1M`;
  if (perM < 1) return `$${perM.toFixed(3)}/1M`;
  return `$${perM.toFixed(2)}/1M`;
}

export function formatModelPricing(model: OpenRouterModel): string {
  if (model.isFree) return "Grátis";
  const inPrice = formatPricePerMillion(model.pricingPrompt);
  const outPrice = formatPricePerMillion(model.pricingCompletion);
  if (inPrice === outPrice) return inPrice;
  return `In ${inPrice} · Out ${outPrice}`;
}

export function classifyModelUseCase(model: OpenRouterModel): ModelUseCase {
  const id = model.id.toLowerCase();
  const mod = model.modality.toLowerCase();

  if (mod.includes("audio") || id.includes("whisper")) return "audio";
  if (mod.includes("video")) return "video";
  if (mod.includes("image") || id.includes("vision")) return "visao_imagem";
  if (id.includes("code") || id.includes("coder") || id.includes("codestral")) {
    return "codigo";
  }
  if (id.includes("deepseek")) return "classificacao_massa";
  if (id.includes("gemini") && id.includes("flash")) return "rapido_volume";
  if (id.includes("gemini") && id.includes("free")) return "rapido_volume";
  if (id.includes("llama") || id.includes("qwen") || id.includes("mistral")) {
    return model.isFree ? "chat_geral" : "chat_geral";
  }
  if (id.includes("mini") || id.includes("flash") || id.includes("haiku")) {
    return "rapido_volume";
  }
  return "outro";
}

export interface EnrichedOpenRouterModel extends OpenRouterModel {
  useCase: ModelUseCase;
  useCaseLabel: string;
  qualityRank: number | null;
  qualityLabel: string | null;
  priceLabel: string;
}

export function enrichModel(model: OpenRouterModel): EnrichedOpenRouterModel {
  const useCase = classifyModelUseCase(model);
  let qualityRank: number | null = null;
  let qualityLabel: string | null = null;

  if (!model.isFree) {
    const tier = paidTierIndex(model.id);
    qualityRank = tier < PAID_QUALITY_ORDER.length + 100 ? tier + 1 : null;
    if (qualityRank != null && qualityRank <= 5) qualityLabel = "Top tier";
    else if (qualityRank != null && qualityRank <= 12) qualityLabel = "Alto";
    else if (qualityRank != null && qualityRank <= 20) qualityLabel = "Bom";
    else qualityLabel = "Padrão";
  }

  return {
    ...model,
    useCase,
    useCaseLabel: USE_CASE_LABELS[useCase],
    qualityRank,
    qualityLabel,
    priceLabel: formatModelPricing(model),
  };
}

export function sortFreeModels(models: EnrichedOpenRouterModel[]): EnrichedOpenRouterModel[] {
  const useOrder: ModelUseCase[] = [
    "classificacao_massa",
    "rapido_volume",
    "chat_geral",
    "codigo",
    "visao_imagem",
    "audio",
    "video",
    "outro",
  ];
  return [...models].sort((a, b) => {
    const ua = useOrder.indexOf(a.useCase);
    const ub = useOrder.indexOf(b.useCase);
    if (ua !== ub) return ua - ub;
    return a.name.localeCompare(b.name);
  });
}

export function sortPaidModels(models: EnrichedOpenRouterModel[]): EnrichedOpenRouterModel[] {
  return [...models].sort((a, b) => {
    const ta = paidTierIndex(a.id);
    const tb = paidTierIndex(b.id);
    if (ta !== tb) return ta - tb;
    const costA = a.pricingPrompt + a.pricingCompletion;
    const costB = b.pricingPrompt + b.pricingCompletion;
    if (costA !== costB) return costA - costB;
    const ctxA = a.contextLength ?? 0;
    const ctxB = b.contextLength ?? 0;
    if (ctxB !== ctxA) return ctxB - ctxA;
    return a.name.localeCompare(b.name);
  });
}

export function enrichAndSortModels(
  models: OpenRouterModel[],
  filter: "all" | "free" | "paid",
): EnrichedOpenRouterModel[] {
  const enriched = models.map(enrichModel);
  if (filter === "free") return sortFreeModels(enriched.filter((m) => m.isFree));
  if (filter === "paid") return sortPaidModels(enriched.filter((m) => !m.isFree));
  return enriched.sort((a, b) => a.name.localeCompare(b.name));
}
