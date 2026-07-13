import { MVP_TENANT_ID, pool } from "@workspace/db";
import { sendTelegramMessage, telegramConfigFromEnv } from "./telegram";
import {
  buildDigestMessage,
  loadDigestContext,
} from "./telegram-content";

export interface DailyDigestOptions {
  tenantId?: string;
  force?: boolean;
  appUrl?: string | null;
}

export async function digestAlreadySentToday(
  channel = "telegram",
): Promise<boolean> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::int as n from daily_digest_log
      where channel = $1 and sent_at::date = (now() at time zone 'America/Sao_Paulo')::date`,
    [channel],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function recordDigestSent(channel = "telegram"): Promise<void> {
  await pool.query(
    `insert into daily_digest_log (channel) values ($1)`,
    [channel],
  );
}

/** @deprecated use buildDigestMessage via telegram-content */
export async function buildDailyDigestText(
  tenantId: string,
  appUrl?: string | null,
): Promise<string> {
  const ctx = await loadDigestContext(tenantId, appUrl);
  return buildDigestMessage(ctx).text;
}

export async function sendDailyDigest(
  opts: DailyDigestOptions = {},
): Promise<{ sent: boolean; reason?: string }> {
  const tenantId = opts.tenantId ?? MVP_TENANT_ID;
  const cfg = telegramConfigFromEnv();
  if (!cfg) {
    return { sent: false, reason: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente" };
  }

  if (!opts.force && (await digestAlreadySentToday())) {
    return { sent: false, reason: "já enviado hoje" };
  }

  const ctx = await loadDigestContext(tenantId, opts.appUrl);
  const msg = buildDigestMessage(ctx);
  await sendTelegramMessage(cfg, msg.text, {
    parseMode: msg.parseMode,
    replyMarkup: msg.replyMarkup,
  });
  await recordDigestSent();
  return { sent: true };
}

export async function sendDigestNow(
  opts: Omit<DailyDigestOptions, "force"> = {},
): Promise<void> {
  const tenantId = opts.tenantId ?? MVP_TENANT_ID;
  const cfg = telegramConfigFromEnv();
  if (!cfg) throw new Error("Telegram não configurado");
  const ctx = await loadDigestContext(tenantId, opts.appUrl);
  const msg = buildDigestMessage(ctx);
  await sendTelegramMessage(cfg, msg.text, {
    parseMode: msg.parseMode,
    replyMarkup: msg.replyMarkup,
  });
}
