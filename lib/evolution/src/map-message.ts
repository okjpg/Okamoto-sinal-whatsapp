export type WhatsappMessageInsert = {
  whatsapp_owner: string;
  chat_type: string;
  chat_id: string;
  chat_name: string | null;
  contact_phone: string | null;
  sender_phone: string | null;
  sender_name: string | null;
  recipient_phone: string | null;
  direction: string;
  message_type: string | null;
  message: string | null;
  caption: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  message_id: string;
  reply_to_message_id: string | null;
  forwarded: boolean | null;
  status: string | null;
  message_created_at: Date | null;
  metadata: Record<string, unknown>;
};

export type EvolutionKey = {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
};

export type EvolutionPayload = {
  key?: EvolutionKey;
  pushName?: string;
  groupSubject?: string;
  groupName?: string;
  subject?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number | string;
  status?: string;
};

function groupChatName(raw: EvolutionPayload): string | null {
  for (const candidate of [raw.groupSubject, raw.groupName, raw.subject]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function digits(jid: string | undefined): string {
  if (!jid) return "";
  return jid.replace(/@.+$/, "").replace(/\D/g, "");
}

function isGroup(jid: string | undefined): boolean {
  return !!jid?.endsWith("@g.us");
}

/** Stable raw_type keys consumed by the Mídia API (PascalCase). */
export function normalizeRawType(messageType: string | null | undefined): string | null {
  if (!messageType) return null;
  const t = messageType.toLowerCase();
  if (t.includes("image")) return "ImageMessage";
  if (t.includes("audio") || t.includes("ptt")) return "AudioMessage";
  if (t === "ptvmessage") return "PtvMessage";
  if (t.includes("video")) return "VideoMessage";
  if (t.includes("document")) return "DocumentMessage";
  if (t.includes("sticker")) return "StickerMessage";
  return null;
}

type MediaBlob = { mimetype?: string; caption?: string; fileName?: string };

function extractMediaBlob(
  message: Record<string, unknown> | undefined,
): { blob: MediaBlob; rawType: string } | null {
  if (!message) return null;
  const pairs: [string, string][] = [
    ["imageMessage", "ImageMessage"],
    ["audioMessage", "AudioMessage"],
    ["pttMessage", "AudioMessage"],
    ["videoMessage", "VideoMessage"],
    ["ptvMessage", "PtvMessage"],
    ["documentMessage", "DocumentMessage"],
    ["stickerMessage", "StickerMessage"],
  ];
  for (const [field, rawType] of pairs) {
    const blob = message[field] as MediaBlob | undefined;
    if (blob && typeof blob === "object") return { blob, rawType };
  }
  return null;
}

function extractText(message: Record<string, unknown> | undefined): {
  text: string | null;
  caption: string | null;
} {
  if (!message) return { text: null, caption: null };
  if (typeof message.conversation === "string") {
    return { text: message.conversation, caption: null };
  }
  const ext = message.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return { text: ext.text, caption: null };

  const media = extractMediaBlob(message);
  if (media) {
    const cap = media.blob.caption ?? null;
    if (media.rawType === "AudioMessage") {
      return { text: "[áudio]", caption: null };
    }
    if (media.rawType === "StickerMessage") {
      return { text: "[sticker]", caption: null };
    }
    if (media.rawType === "DocumentMessage") {
      return { text: media.blob.fileName ?? null, caption: cap };
    }
    return { text: null, caption: cap };
  }

  return { text: null, caption: null };
}

function replyId(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  for (const v of Object.values(message)) {
    if (v && typeof v === "object" && "contextInfo" in (v as object)) {
      const ctx = (v as { contextInfo?: { stanzaId?: string } }).contextInfo;
      if (ctx?.stanzaId) return ctx.stanzaId;
    }
  }
  return null;
}

export function mapEvolutionMessage(
  raw: EvolutionPayload,
  whatsappOwner: string,
  instance: string,
): WhatsappMessageInsert | null {
  const key = raw.key;
  if (!key?.id || !key.remoteJid) return null;

  const remoteJid = key.remoteJid;
  const group = isGroup(remoteJid);
  const chatId = group ? remoteJid.replace(/@g.us$/, "") : digits(remoteJid);
  const fromMe = !!key.fromMe;
  const senderPhone = group
    ? digits(key.participant)
    : fromMe
      ? whatsappOwner
      : digits(remoteJid);
  const { text, caption } = extractText(raw.message);
  const ts = raw.messageTimestamp
    ? new Date(Number(raw.messageTimestamp) * 1000)
    : null;

  const media = extractMediaBlob(raw.message);
  const rawType =
    normalizeRawType(raw.messageType) ?? media?.rawType ?? null;
  const mediaMime =
    media?.blob.mimetype ??
    (rawType === "AudioMessage"
      ? "audio/ogg"
      : rawType === "ImageMessage"
        ? "image/jpeg"
        : null);

  const evolutionKey: EvolutionKey = {
    remoteJid: key.remoteJid,
    fromMe: key.fromMe,
    id: key.id,
    participant: key.participant,
  };

  return {
    whatsapp_owner: whatsappOwner,
    chat_type: group ? "group" : "private",
    chat_id: chatId,
    chat_name: group ? groupChatName(raw) : (raw.pushName ?? null),
    contact_phone: group ? null : chatId,
    sender_phone: senderPhone || null,
    sender_name: raw.pushName ?? null,
    recipient_phone: fromMe ? chatId : whatsappOwner,
    direction: fromMe ? "outbound" : "inbound",
    message_type: raw.messageType ?? null,
    message: text,
    caption,
    media_url: null,
    media_mime_type: mediaMime,
    message_id: `${instance}:${key.remoteJid}:${key.id}`,
    reply_to_message_id: replyId(raw.message),
    forwarded: null,
    status: raw.status ?? null,
    message_created_at: ts,
    metadata: {
      source: "evolution-api",
      instance,
      remoteJid: key.remoteJid,
      raw_type: rawType,
      evolutionKey,
    },
  };
}

export function extractEvolutionMessages(body: unknown): EvolutionPayload[] {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  const event = String(obj.event ?? obj.type ?? "").toLowerCase();
  if (event && !event.includes("message")) return [];

  const data = obj.data;
  if (Array.isArray(data)) {
    return data.filter((d): d is EvolutionPayload => !!d && typeof d === "object");
  }
  if (data && typeof data === "object") return [data as EvolutionPayload];
  if (obj.key && obj.message) return [obj as EvolutionPayload];
  return [];
}
