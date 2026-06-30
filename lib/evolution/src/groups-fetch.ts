import type { EvolutionApiConfig } from "./media-fetch.js";

export type EvolutionGroupInfo = {
  id: string;
  subject: string | null;
  size: number | null;
};

function chatIdFromJid(jid: string): string {
  return jid.replace(/@g\.us$/i, "");
}

function readGroupName(raw: Record<string, unknown>): string | null {
  for (const key of ["subject", "name", "groupName", "title"] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** List WhatsApp groups from Evolution API (subject = display name). */
export async function fetchEvolutionGroups(
  cfg: EvolutionApiConfig,
  opts?: { getParticipants?: boolean },
): Promise<EvolutionGroupInfo[]> {
  const getParticipants = opts?.getParticipants ?? false;
  const url = `${cfg.base.replace(/\/$/, "")}/group/fetchAllGroups/${cfg.instance}?getParticipants=${getParticipants}`;
  const res = await fetch(url, {
    headers: { apikey: cfg.apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fetchAllGroups failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) return [];

  return body
    .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
    .map((g) => {
      const id = typeof g.id === "string" ? g.id : "";
      if (!id.endsWith("@g.us")) return null;
      const size = typeof g.size === "number" ? g.size : null;
      return {
        id: chatIdFromJid(id),
        subject: readGroupName(g),
        size,
      };
    })
    .filter((g): g is EvolutionGroupInfo => g !== null && !!g.id);
}
