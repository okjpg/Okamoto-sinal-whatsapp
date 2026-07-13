import { MVP_TENANT_ID } from "@workspace/db";
import { triggerRefreshFromTelegram } from "./telegram-actions";
import {
  answerTelegramCallback,
  isAuthorizedTelegramChat,
  registerTelegramCommands,
  sendTelegramToChat,
  telegramConfigFromEnv,
  type SendTelegramOptions,
} from "./telegram";
import {
  buildDigestMessage,
  buildDmsMessage,
  buildHelpMessage,
  buildMencoesMessage,
  buildPendenciasMessage,
  buildRefreshBusyMessage,
  buildRefreshStartedMessage,
  buildStatusMessage,
  buildTasksMessage,
  buildWelcomeMessage,
  buildWhatsAppMessage,
  loadDigestContext,
} from "./telegram-content";
import {
  MENU_AJUDA,
  MENU_ATUALIZAR,
  MENU_DMS,
  MENU_MENCOES,
  MENU_PENDENCIAS,
  MENU_RESUMO,
  MENU_STATUS,
  MENU_TASKS,
  MENU_WHATSAPP,
} from "./telegram-keyboards";
import { logger } from "./logger";

interface TelegramUpdate {
  update_id?: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number } };
  };
}

let commandsRegistered = false;

export async function ensureTelegramCommands(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token || commandsRegistered) return;
  try {
    await registerTelegramCommands(token);
    commandsRegistered = true;
    logger.info("Telegram bot commands registered");
  } catch (e) {
    logger.warn({ err: e }, "Telegram setMyCommands failed");
  }
}

async function reply(
  chatId: number,
  payload: SendTelegramOptions & { text: string },
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  const { text, ...opts } = payload;
  await sendTelegramToChat(token, chatId, text, {
    parseMode: opts.parseMode ?? "HTML",
    replyMarkup: opts.replyMarkup,
    disablePreview: opts.disablePreview,
  });
}

async function handleRefresh(chatId: number): Promise<void> {
  const result = await triggerRefreshFromTelegram(MVP_TENANT_ID);
  if (!result.ok) {
    await reply(chatId, {
      text: `Não foi possível iniciar: ${result.reason}`,
      parseMode: "HTML",
    });
    return;
  }
  if (!result.started) {
    await reply(chatId, buildRefreshBusyMessage());
    return;
  }
  await reply(chatId, buildRefreshStartedMessage(result.runId));
}

async function dispatchView(
  chatId: number,
  view: string,
): Promise<void> {
  const ctx = await loadDigestContext(MVP_TENANT_ID);
  switch (view) {
    case "sum":
      await reply(chatId, buildDigestMessage(ctx));
      break;
    case "pen":
      await reply(chatId, buildPendenciasMessage(ctx));
      break;
    case "dm":
      await reply(chatId, buildDmsMessage(ctx));
      break;
    case "tsk":
      await reply(chatId, buildTasksMessage(ctx));
      break;
    case "mnc":
      await reply(chatId, buildMencoesMessage(ctx));
      break;
    case "wa":
      await reply(chatId, buildWhatsAppMessage(ctx));
      break;
    case "sts":
      await reply(chatId, buildStatusMessage(ctx));
      break;
    default:
      await reply(chatId, buildWelcomeMessage());
  }
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const cfg = telegramConfigFromEnv();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!cfg || !token) return;

  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat.id;
    if (!chatId || !isAuthorizedTelegramChat(chatId, cfg)) {
      await answerTelegramCallback(token, cq.id, "Não autorizado");
      return;
    }
    const data = cq.data ?? "";
    if (data === "dig:ref") {
      await answerTelegramCallback(token, cq.id, "Gerando resumo…");
      await dispatchView(chatId, "sum");
    } else if (data === "ref:run") {
      await answerTelegramCallback(token, cq.id, "Iniciando refresh…");
      await handleRefresh(chatId);
    } else if (data.startsWith("nav:")) {
      await answerTelegramCallback(token, cq.id);
      await dispatchView(chatId, data.slice(4));
    } else {
      await answerTelegramCallback(token, cq.id);
    }
    return;
  }

  const message = update.message;
  if (!message?.text) return;
  const chatId = message.chat.id;
  if (!isAuthorizedTelegramChat(chatId, cfg)) {
    await reply(chatId, {
      text: "Este bot é privado. Configure <code>TELEGRAM_CHAT_ID</code> com o seu chat.",
      parseMode: "HTML",
    });
    return;
  }

  const text = message.text.trim();
  const cmd = text.split(/\s+/)[0]?.toLowerCase().replace(/@\w+$/, "") ?? "";

  if (cmd === "/start" || cmd === "/menu") {
    await reply(chatId, buildWelcomeMessage());
    return;
  }
  if (cmd === "/ajuda" || cmd === "/help" || text === MENU_AJUDA) {
    await reply(chatId, buildHelpMessage());
    return;
  }
  if (cmd === "/resumo" || text === MENU_RESUMO) {
    await dispatchView(chatId, "sum");
    return;
  }
  if (cmd === "/pendencias" || text === MENU_PENDENCIAS) {
    await dispatchView(chatId, "pen");
    return;
  }
  if (cmd === "/dms" || text === MENU_DMS) {
    await dispatchView(chatId, "dm");
    return;
  }
  if (cmd === "/tasks" || text === MENU_TASKS) {
    await dispatchView(chatId, "tsk");
    return;
  }
  if (cmd === "/mencoes" || cmd === "/menções" || text === MENU_MENCOES) {
    await dispatchView(chatId, "mnc");
    return;
  }
  if (
    cmd === "/whatsapp" ||
    cmd === "/conexao" ||
    cmd === "/conexão" ||
    text === MENU_WHATSAPP
  ) {
    await dispatchView(chatId, "wa");
    return;
  }
  if (cmd === "/status" || text === MENU_STATUS) {
    await dispatchView(chatId, "sts");
    return;
  }
  if (cmd === "/atualizar" || cmd === "/refresh" || text === MENU_ATUALIZAR) {
    await handleRefresh(chatId);
    return;
  }

  await reply(chatId, {
    text: "Comando não reconhecido. Use /ajuda ou o menu abaixo.",
    parseMode: "HTML",
    replyMarkup: buildWelcomeMessage().replyMarkup,
  });
}
