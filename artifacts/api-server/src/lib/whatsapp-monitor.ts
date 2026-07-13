import { MVP_TENANT_ID } from "@workspace/db";
import { logger } from "./logger";
import { getDefaultWhatsAppConnectionStatus } from "./whatsapp-connection";
import { sendTelegramMessage, telegramConfigFromEnv } from "./telegram";
import { escapeTelegramHtml } from "./telegram";
import { metricRow, telegramHeader } from "./telegram-format";

const CHECK_MS = 5 * 60 * 1000;

let lastConnected: boolean | null = null;
let lastWebhookStale = false;
let lastOfflineAlertAt = 0;
let lastStaleAlertAt = 0;

function cooldownMs(): number {
  const n = Number(process.env.TELEGRAM_WA_ALERT_COOLDOWN_MS);
  return Number.isFinite(n) && n > 0 ? n : 30 * 60 * 1000;
}

function enabled(): boolean {
  const flag = process.env.TELEGRAM_WA_OFFLINE_ALERTS;
  return flag === "1" || flag === "true";
}

async function notify(parts: string[]): Promise<void> {
  const cfg = telegramConfigFromEnv();
  if (!cfg) return;
  await sendTelegramMessage(cfg, parts.join("\n"), { parseMode: "HTML" });
}

export function startWhatsAppMonitor(): void {
  if (!enabled()) {
    logger.info("WhatsApp monitor disabled (TELEGRAM_WA_OFFLINE_ALERTS)");
    return;
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    logger.info("WhatsApp monitor skipped — Telegram não configurado");
    return;
  }

  const tick = async () => {
    try {
      const status = await getDefaultWhatsAppConnectionStatus();
      const now = Date.now();
      const cd = cooldownMs();

      if (lastConnected === true && !status.connected) {
        if (now - lastOfflineAlertAt >= cd) {
          lastOfflineAlertAt = now;
          const inst = escapeTelegramHtml(status.instance ?? "—");
          const state = escapeTelegramHtml(status.state);
          const reason = status.instanceDetails?.disconnectionMessage
            ? escapeTelegramHtml(status.instanceDetails.disconnectionMessage)
            : null;
          const parts = [
            telegramHeader("SINAL · WhatsApp desconectou", "🔴"),
            "",
            metricRow("Instância", inst),
            metricRow("Estado", state),
          ];
          if (reason) parts.push(metricRow("Motivo", reason));
          parts.push("", "<i>Reconecte em Conectores → WhatsApp.</i>");
          await notify(parts);
        }
      }

      if (lastConnected === false && status.connected) {
        await notify([
          telegramHeader("SINAL · WhatsApp reconectou", "🟢"),
          "",
          metricRow("Instância", escapeTelegramHtml(status.instance ?? "—")),
        ]);
      }

      if (
        status.connected &&
        status.webhookStale &&
        !lastWebhookStale &&
        now - lastStaleAlertAt >= cd
      ) {
        lastStaleAlertAt = now;
        const parts = [
          telegramHeader("SINAL · Webhook parado", "⚠️"),
          "",
          status.webhookStaleReason
            ? escapeTelegramHtml(status.webhookStaleReason)
            : "Mensagens podem não estar chegando ao Sinal.",
          "",
          "<i>Verifique ngrok, rode fix-webhook ou Conectores → Re-registrar webhook.</i>",
        ];
        await notify(parts);
      }

      lastConnected = status.connected;
      lastWebhookStale = status.webhookStale;
    } catch (err) {
      logger.warn({ err, tenantId: MVP_TENANT_ID }, "WhatsApp monitor tick failed");
    }
  };

  void tick();
  setInterval(() => void tick(), CHECK_MS);
  logger.info({ intervalMs: CHECK_MS }, "WhatsApp monitor started");
}
