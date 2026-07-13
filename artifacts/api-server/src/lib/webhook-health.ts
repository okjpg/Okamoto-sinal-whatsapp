import type { MessageMirror } from "./whatsapp-connection";

let lastWebhookAt: Date | null = null;

export function recordWebhookHit(): void {
  lastWebhookAt = new Date();
}

export function getLastWebhookAt(): string | null {
  return lastWebhookAt?.toISOString() ?? null;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 60_000);
}

function staleMinutes(): number {
  const n = Number(process.env.WEBHOOK_STALE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 360;
}

export function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

export function webhookUrlsMatch(expected: string | null, actual: string | null): boolean {
  if (!expected || !actual) return false;
  return normalizeWebhookUrl(expected) === normalizeWebhookUrl(actual);
}

export interface WebhookHealth {
  lastWebhookAt: string | null;
  minutesSinceLastWebhook: number | null;
  minutesSinceLastMessage: number | null;
  webhookStale: boolean;
  webhookStaleReason: string | null;
}

export function computeWebhookHealth(
  mirror: MessageMirror,
  connected: boolean,
): WebhookHealth {
  const lastWebhookAtIso = getLastWebhookAt();
  const minutesSinceLastWebhook = minutesSince(lastWebhookAtIso);
  const minutesSinceLastMessage = minutesSince(mirror.lastMessageAt);
  const threshold = staleMinutes();

  let webhookStale = false;
  let webhookStaleReason: string | null = null;

  if (connected && mirror.totalMessages > 0 && minutesSinceLastMessage !== null) {
    if (minutesSinceLastMessage >= threshold) {
      webhookStale = true;
      webhookStaleReason = `Última mensagem há ${minutesSinceLastMessage} min (limite ${threshold} min)`;
    }
  }

  if (
    connected &&
    lastWebhookAtIso &&
    minutesSinceLastWebhook !== null &&
    minutesSinceLastWebhook >= threshold
  ) {
    webhookStale = true;
    webhookStaleReason =
      webhookStaleReason ??
      `Último webhook há ${minutesSinceLastWebhook} min (limite ${threshold} min)`;
  }

  if (connected && mirror.totalMessages > 0 && !lastWebhookAtIso) {
    webhookStale = true;
    webhookStaleReason =
      webhookStaleReason ??
      "Nenhum webhook recebido nesta sessão da API — ngrok pode estar offline";
  }

  return {
    lastWebhookAt: lastWebhookAtIso,
    minutesSinceLastWebhook,
    minutesSinceLastMessage,
    webhookStale,
    webhookStaleReason,
  };
}
