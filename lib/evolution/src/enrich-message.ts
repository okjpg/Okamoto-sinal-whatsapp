import {
  fetchEvolutionMedia,
  mediaResultToDataUrl,
  type EvolutionApiConfig,
  type EvolutionMessageKey,
} from "./media-fetch.js";
import {
  mapEvolutionMessage,
  type EvolutionPayload,
  type WhatsappMessageInsert,
} from "./map-message.js";

export type { EvolutionPayload };

/** Parse message_id format: `{instance}:{remoteJid}:{waMessageId}` */
export function parseEvolutionMessageId(messageId: string): {
  instance: string;
  remoteJid: string;
  id: string;
} | null {
  const last = messageId.lastIndexOf(":");
  const first = messageId.indexOf(":");
  if (first < 0 || last <= first) return null;
  return {
    instance: messageId.slice(0, first),
    remoteJid: messageId.slice(first + 1, last),
    id: messageId.slice(last + 1),
  };
}

export function evolutionKeyFromRow(row: WhatsappMessageInsert): EvolutionMessageKey | null {
  const stored = row.metadata.evolutionKey;
  if (stored && typeof stored === "object") {
    const k = stored as EvolutionMessageKey;
    if (k.remoteJid && k.id) {
      return {
        remoteJid: k.remoteJid,
        fromMe: Boolean(k.fromMe),
        id: k.id,
        participant: k.participant,
      };
    }
  }

  const parsed = parseEvolutionMessageId(row.message_id);
  if (!parsed) return null;

  const fromMe = row.direction === "outbound";
  const key: EvolutionMessageKey = {
    remoteJid: parsed.remoteJid,
    fromMe,
    id: parsed.id,
  };
  if (row.chat_type === "group" && row.sender_phone) {
    key.participant = `${row.sender_phone}@s.whatsapp.net`;
  }
  return key;
}

export function isMediaMessage(row: WhatsappMessageInsert): boolean {
  const rawType = row.metadata.raw_type;
  if (typeof rawType === "string" && rawType.length > 0) return true;
  const t = (row.message_type ?? "").toLowerCase();
  return /image|audio|video|document|sticker|ptt/.test(t);
}

/** Map webhook payload and optionally download media from Evolution API. */
export async function enrichEvolutionMessage(
  raw: EvolutionPayload,
  whatsappOwner: string,
  instance: string,
  cfg: EvolutionApiConfig | null,
): Promise<WhatsappMessageInsert | null> {
  const row = mapEvolutionMessage(raw, whatsappOwner, instance);
  if (!row || !isMediaMessage(row) || row.media_url || !cfg) return row;

  const key = evolutionKeyFromRow(row);
  if (!key) return row;

  try {
    const media = await fetchEvolutionMedia(cfg, key);
    if (media) {
      row.media_url = mediaResultToDataUrl(media);
      row.media_mime_type = media.mimetype;
    }
  } catch {
    // Keep row with metadata/raw_type; backfill can retry later.
  }

  return row;
}
