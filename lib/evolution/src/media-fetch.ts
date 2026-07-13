export interface EvolutionApiConfig {
  base: string;
  apiKey: string;
  instance: string;
}

export type EvolutionMessageKey = {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
};

export interface EvolutionMediaResult {
  mimetype: string;
  base64: string;
  fileName?: string;
}

function toDataUrl(mimetype: string, base64: string): string {
  const clean = base64.replace(/^data:[^;]+;base64,/, "").trim();
  return `data:${mimetype};base64,${clean}`;
}

/** Fetch media bytes from Evolution API (Baileys decrypt + base64). */
export async function fetchEvolutionMedia(
  cfg: EvolutionApiConfig,
  key: EvolutionMessageKey,
): Promise<EvolutionMediaResult | null> {
  const url = `${cfg.base.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${cfg.instance}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: cfg.apiKey,
    },
    body: JSON.stringify({
      message: { key },
      convertToMp4: false,
    }),
  });

  if (!res.ok) return null;

  const body = (await res.json()) as {
    mimetype?: string;
    base64?: string;
    fileName?: string;
    mediaType?: string;
  };

  const base64 = body.base64?.trim();
  if (!base64) return null;

  const mimetype =
    body.mimetype ??
    (body.mediaType === "audio" ? "audio/ogg" : "application/octet-stream");

  return { mimetype, base64, fileName: body.fileName };
}

export function mediaResultToDataUrl(result: EvolutionMediaResult): string {
  return toDataUrl(result.mimetype, result.base64);
}

export function getEvolutionApiConfigFromEnv(
  instanceOverride?: string,
): EvolutionApiConfig | null {
  const base = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = (instanceOverride ?? process.env.EVOLUTION_INSTANCE ?? "sinal").trim();
  if (!base || !apiKey || !instance) return null;
  return { base, apiKey, instance };
}
