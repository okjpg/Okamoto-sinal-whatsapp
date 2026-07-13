export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export type TelegramParseMode = "HTML" | "MarkdownV2";

export interface TelegramInlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface TelegramReplyMarkup {
  inline_keyboard?: TelegramInlineButton[][];
  keyboard?: { text: string }[][];
  resize_keyboard?: boolean;
  persistent?: boolean;
  one_time_keyboard?: boolean;
}

export interface SendTelegramOptions {
  parseMode?: TelegramParseMode;
  replyMarkup?: TelegramReplyMarkup;
  disablePreview?: boolean;
}

export function telegramConfigFromEnv(): TelegramConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

export function escapeTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function apiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramApi<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const r = await fetch(apiUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!r.ok || json.ok === false) {
    throw new Error(
      `Telegram ${method} ${r.status}: ${json.description ?? r.statusText}`,
    );
  }
  return json as T;
}

export async function sendTelegramMessage(
  cfg: TelegramConfig,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<void> {
  await telegramApi(cfg.botToken, "sendMessage", {
    chat_id: cfg.chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    disable_web_page_preview: opts.disablePreview ?? true,
    reply_markup: opts.replyMarkup,
  });
}

export async function sendTelegramToChat(
  botToken: string,
  chatId: string | number,
  text: string,
  opts: SendTelegramOptions = {},
): Promise<void> {
  await telegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parseMode ?? "HTML",
    disable_web_page_preview: opts.disablePreview ?? true,
    reply_markup: opts.replyMarkup,
  });
}

export async function answerTelegramCallback(
  botToken: string,
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  await telegramApi(botToken, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function registerTelegramCommands(botToken: string): Promise<void> {
  await telegramApi(botToken, "setMyCommands", {
    commands: [
      { command: "start", description: "Iniciar e exibir menu" },
      { command: "resumo", description: "Resumo executivo do Sinal" },
      { command: "pendencias", description: "Fila de atenção" },
      { command: "dms", description: "DMs pendentes com resumo IA" },
      { command: "tasks", description: "Tasks em aberto" },
      { command: "mencoes", description: "Menções monitoradas" },
      { command: "whatsapp", description: "Instância, número e conexão WA" },
      { command: "atualizar", description: "Rodar pipeline de dados" },
      { command: "status", description: "WhatsApp, refresh e pipeline" },
      { command: "ajuda", description: "Comandos e integração" },
    ],
  });
}

export function isAuthorizedTelegramChat(
  chatId: number | string,
  cfg: TelegramConfig,
): boolean {
  return String(chatId) === String(cfg.chatId);
}
