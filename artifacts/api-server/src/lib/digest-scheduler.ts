import { MVP_TENANT_ID } from "@workspace/db";
import { logger } from "./logger";
import { sendDailyDigest } from "./daily-digest";

const CHECK_MS = 15 * 60 * 1000; // a cada 15 min verifica se é hora de enviar

function digestHour(): number {
  const h = Number(process.env.TELEGRAM_DIGEST_HOUR);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 8;
}

function digestTz(): string {
  return process.env.TELEGRAM_DIGEST_TZ?.trim() || "America/Sao_Paulo";
}

function localHourNow(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

export function startDailyDigestScheduler(): void {
  const disabled =
    process.env.TELEGRAM_DIGEST_DISABLED === "1" ||
    process.env.TELEGRAM_DIGEST_DISABLED === "true";
  if (disabled) {
    logger.info("daily digest scheduler disabled (TELEGRAM_DIGEST_DISABLED)");
    return;
  }

  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    logger.info("daily digest scheduler skipped — Telegram não configurado");
    return;
  }

  const tz = digestTz();
  const targetHour = digestHour();

  const tick = async (): Promise<void> => {
    if (localHourNow(tz) !== targetHour) return;
    try {
      const result = await sendDailyDigest({ tenantId: MVP_TENANT_ID });
      if (result.sent) {
        logger.info("daily digest enviado ao Telegram");
      } else {
        logger.debug({ reason: result.reason }, "daily digest não enviado");
      }
    } catch (e) {
      logger.error({ err: e }, "daily digest tick failed");
    }
  };

  const timer = setInterval(() => void tick(), CHECK_MS);
  timer.unref?.();
  logger.info({ targetHour, tz }, "daily digest scheduler started");
}
