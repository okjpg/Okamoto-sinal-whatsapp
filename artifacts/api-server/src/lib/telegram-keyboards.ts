import type { TelegramReplyMarkup } from "./telegram";

export const MENU_RESUMO = "Resumo diário";
export const MENU_PENDENCIAS = "Pendências";
export const MENU_DMS = "DMs pendentes";
export const MENU_TASKS = "Tasks";
export const MENU_MENCOES = "Menções";
export const MENU_WHATSAPP = "WhatsApp";
export const MENU_ATUALIZAR = "Atualizar dados";
export const MENU_STATUS = "Status";
export const MENU_AJUDA = "Ajuda";

/** Telegram só aceita URLs públicas em botões inline (não localhost). */
export function isTelegramInlineUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function refreshRow(): TelegramReplyMarkup["inline_keyboard"] {
  return [
    [
      { text: "Atualizar dados", callback_data: "ref:run" },
      { text: "Atualizar resumo", callback_data: "dig:ref" },
    ],
  ];
}

function navRow(): TelegramReplyMarkup["inline_keyboard"] {
  return [
    [
      { text: "Resumo", callback_data: "nav:sum" },
      { text: "Pendências", callback_data: "nav:pen" },
      { text: "WhatsApp", callback_data: "nav:wa" },
    ],
    [
      { text: "DMs", callback_data: "nav:dm" },
      { text: "Tasks", callback_data: "nav:tsk" },
      { text: "Status", callback_data: "nav:sts" },
    ],
  ];
}

export function mainMenuKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: [
      [{ text: MENU_RESUMO }, { text: MENU_PENDENCIAS }],
      [{ text: MENU_DMS }, { text: MENU_TASKS }],
      [{ text: MENU_WHATSAPP }, { text: MENU_MENCOES }],
      [{ text: MENU_ATUALIZAR }, { text: MENU_STATUS }],
      [{ text: MENU_AJUDA }],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

export function digestInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  const base = baseUrl.replace(/\/$/, "");
  const rows: TelegramReplyMarkup["inline_keyboard"] = [
    ...(navRow() ?? []),
    ...(refreshRow() ?? []),
  ];
  if (isTelegramInlineUrl(base)) {
    rows.unshift(
      [{ text: "Abrir dashboard", url: base }],
      [
        { text: "Privado", url: `${base}/privado` },
        { text: "Tasks", url: `${base}/salvos` },
      ],
      [
        { text: "Menções", url: `${base}/mencoes` },
        { text: "Contatos", url: `${base}/contatos` },
      ],
    );
  }
  return { inline_keyboard: rows };
}

export function pendenciasInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  const base = baseUrl.replace(/\/$/, "");
  const rows: TelegramReplyMarkup["inline_keyboard"] = [
    ...(navRow() ?? []),
    ...(refreshRow() ?? []),
  ];
  if (isTelegramInlineUrl(base)) {
    rows.unshift([
      { text: "Ver DMs", url: `${base}/privado` },
      { text: "Ver tasks", url: `${base}/salvos` },
      { text: "Ver menções", url: `${base}/mencoes` },
    ]);
  }
  return { inline_keyboard: rows };
}

export function dmsInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  return navInlineKeyboard(baseUrl, "dms");
}

export function tasksInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  return navInlineKeyboard(baseUrl, "tasks");
}

export function mentionsInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  return navInlineKeyboard(baseUrl, "mentions");
}

export function whatsappInlineKeyboard(baseUrl: string): TelegramReplyMarkup {
  const base = baseUrl.replace(/\/$/, "");
  const rows: TelegramReplyMarkup["inline_keyboard"] = [
    ...(navRow() ?? []),
    ...(refreshRow() ?? []),
  ];
  if (isTelegramInlineUrl(base)) {
    rows.unshift([{ text: "Abrir Conectores", url: `${base}/conectores` }]);
  }
  return { inline_keyboard: rows };
}

export function navInlineKeyboard(
  baseUrl: string,
  _view?: string,
): TelegramReplyMarkup {
  const base = baseUrl.replace(/\/$/, "");
  const rows: TelegramReplyMarkup["inline_keyboard"] = [
    ...(navRow() ?? []),
    ...(refreshRow() ?? []),
  ];
  if (isTelegramInlineUrl(base)) {
    rows.unshift([{ text: "Dashboard", url: base }]);
  }
  return { inline_keyboard: rows };
}
