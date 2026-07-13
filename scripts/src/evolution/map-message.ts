/**
 * Mapeia payload Evolution API v2 (Baileys) → linha whatsapp_messages do Sinal.
 */

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

type EvolutionKey = {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
};

type EvolutionPayload = {
  key?: EvolutionKey;
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number | string;
  status?: string;
};

function digits(jid: string | undefined): string {
  if (!jid) return "";
  return jid.replace(/@.+$/, "").replace(/\D/g, "");
}

function isGroup(jid: string | undefined): boolean {
  return !!jid?.endsWith("@g.us");
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

  const img = message.imageMessage as { caption?: string } | undefined;
  if (img) return { text: null, caption: img.caption ?? null };

  const vid = message.videoMessage as { caption?: string } | undefined;
  if (vid) return { text: null, caption: vid.caption ?? null };

  const doc = message.documentMessage as
    | { caption?: string; fileName?: string }
    | undefined;
  if (doc) {
    return {
      text: doc.fileName ?? null,
      caption: doc.caption ?? null,
    };
  }

  const audio = message.audioMessage as object | undefined;
  if (audio) return { text: "[áudio]", caption: null };

  const sticker = message.stickerMessage as object | undefined;
  if (sticker) return { text: "[sticker]", caption: null };

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

  return {
    whatsapp_owner: whatsappOwner,
    chat_type: group ? "group" : "private",
    chat_id: chatId,
    chat_name: raw.pushName ?? null,
    contact_phone: group ? null : chatId,
    sender_phone: senderPhone || null,
    sender_name: raw.pushName ?? null,
    recipient_phone: fromMe ? chatId : whatsappOwner,
    direction: fromMe ? "outbound" : "inbound",
    message_type: raw.messageType ?? null,
    message: text,
    caption,
    media_url: null,
    media_mime_type: null,
    message_id: `${instance}:${key.remoteJid}:${key.id}`,
    reply_to_message_id: replyId(raw.message),
    forwarded: null,
    status: raw.status ?? null,
    message_created_at: ts,
    metadata: { source: "evolution-api", instance, remoteJid: key.remoteJid },
  };
}

export function extractEvolutionMessages(body: unknown): EvolutionPayload[] {
  if (!body || typeof body !== "object") return [];

  const obj = body as Record<string, unknown>;
  const event = String(obj.event ?? obj.type ?? "").toLowerCase();

  if (event && !event.includes("message")) {
    return [];
  }

  const data = obj.data;
  if (Array.isArray(data)) {
    return data.filter((d): d is EvolutionPayload => !!d && typeof d === "object");
  }
  if (data && typeof data === "object") {
    return [data as EvolutionPayload];
  }
  if (obj.key && obj.message) {
    return [obj as EvolutionPayload];
  }
  return [];
}
