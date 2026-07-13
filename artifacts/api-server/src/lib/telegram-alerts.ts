import type { RefreshRun } from "@workspace/db";
import {
  sendTelegramMessage,
  telegramConfigFromEnv,
} from "./telegram";
import {
  buildDigestMessage,
} from "./telegram-content";
import { loadEnrichedContext } from "./telegram-data";
import {
  collectRefreshAlertSummary,
  type RefreshAlertSummary,
} from "./refresh-alerts";
import {
  bullet,
  healthLabel,
  healthLevel,
  metricRow,
  telegramHeader,
  truncate,
} from "./telegram-format";
import { escapeTelegramHtml } from "./telegram";
import { digestInlineKeyboard } from "./telegram-keyboards";

export async function sendTelegramRefreshAlert(
  tenantId: string,
  run: RefreshRun,
  summary?: RefreshAlertSummary,
): Promise<void> {
  const cfg = telegramConfigFromEnv();
  if (!cfg || run.status !== "completed") return;

  const s = summary ?? (await collectRefreshAlertSummary(tenantId));
  const actionable =
    s.pendingUnanswered > 0 ||
    s.openTasks > 0 ||
    s.mentionsLast24h > 0 ||
    s.expiredSnoozes > 0;

  if (!actionable && process.env.TELEGRAM_ALERT_ALWAYS !== "1") return;

  const ctx = await loadEnrichedContext(tenantId);
  const urgent = s.pendingUnanswered + s.openTasks + s.mentionsLast24h;
  const level = healthLevel(urgent);

  const parts = [
    telegramHeader("SINAL · Refresh concluído", healthLabel(level)),
    "",
    metricRow("DMs sem resposta", s.pendingUnanswered),
    metricRow("Tasks abertas", s.openTasks),
    metricRow("Menções (24h)", s.mentionsLast24h),
    metricRow("Snoozes expirados", s.expiredSnoozes),
  ];

  if (ctx.pendingDms.length > 0) {
    parts.push("", "<b>Top DMs pendentes</b>");
    for (const dm of ctx.pendingDms.slice(0, 2)) {
      const who = escapeTelegramHtml(dm.name ?? dm.chat_id);
      const snippet = dm.summary
        ? ` — <i>${escapeTelegramHtml(truncate(dm.summary, 60))}</i>`
        : "";
      parts.push(bullet(`<b>${who}</b>${snippet}`));
    }
  }

  if (!actionable) {
    parts.push("", "<i>Nenhuma pendência nova — cockpit em dia.</i>");
  }

  const msg = parts.join("\n");
  await sendTelegramMessage(cfg, msg, {
    parseMode: "HTML",
    replyMarkup: actionable
      ? digestInlineKeyboard(ctx.appUrl)
      : undefined,
  });
}

export async function sendTelegramRefreshFailed(
  tenantId: string,
  run: RefreshRun,
): Promise<void> {
  const cfg = telegramConfigFromEnv();
  if (!cfg || run.status !== "failed") return;

  const err = run.error ? truncate(run.error, 180) : "erro desconhecido";
  await sendTelegramMessage(
    cfg,
    [
      telegramHeader("SINAL · Refresh falhou"),
      "",
      `<code>${escapeTelegramHtml(err)}</code>`,
      "",
      "Verifique os logs da API ou rode /status.",
    ].join("\n"),
    { parseMode: "HTML" },
  );
}
