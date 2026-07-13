import { escapeTelegramHtml } from "./telegram";

export type HealthLevel = "ok" | "warn" | "alert";

export function telegramHeader(title: string, subtitle?: string): string {
  const lines = [`<b>${escapeTelegramHtml(title)}</b>`];
  if (subtitle) lines.push(`<i>${escapeTelegramHtml(subtitle)}</i>`);
  return lines.join("\n");
}

export function telegramRule(): string {
  return "─────────────────";
}

export function fmtBar(value: number, max: number, width = 5): string {
  if (max <= 0) return "▯".repeat(width);
  const filled = Math.min(width, Math.max(0, Math.round((value / max) * width)));
  return "▮".repeat(filled) + "▯".repeat(width - filled);
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function healthLevel(urgent: number, warn = 1): HealthLevel {
  if (urgent >= warn + 2) return "alert";
  if (urgent >= warn) return "warn";
  return "ok";
}

export function healthLabel(level: HealthLevel): string {
  if (level === "alert") return "Urgente";
  if (level === "warn") return "Atenção";
  return "Em dia";
}

export function trendLabel(pct: number): string {
  if (pct > 5) return `↑ ${pct}% vs período anterior`;
  if (pct < -5) return `↓ ${Math.abs(pct)}% vs período anterior`;
  return "estável vs período anterior";
}

export function formatBrazilPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return raw;
}

export function phoneFromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const m = jid.match(/^(\d+)/);
  return m ? m[1] : null;
}

export function connectionStateLabel(state: string, connected: boolean): string {
  if (connected) return "Conectado";
  const s = state.toLowerCase();
  if (s === "connecting") return "Aguardando QR";
  if (s === "close" || s === "closed") return "Desconectado";
  if (s === "error") return "Erro na API";
  if (s === "not_configured") return "Não configurado";
  return state;
}

export function fmtIsoBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

export function metricRow(
  label: string,
  value: number | string,
  opts?: { bar?: { value: number; max: number }; highlight?: boolean },
): string {
  const v =
    typeof value === "number"
      ? `<b>${value}</b>`
      : opts?.highlight
        ? `<b>${escapeTelegramHtml(value)}</b>`
        : escapeTelegramHtml(String(value));
  const bar = opts?.bar ? ` ${fmtBar(opts.bar.value, opts.bar.max)}` : "";
  return `  ${escapeTelegramHtml(label)}${bar}  ${v}`;
}

export function bullet(text: string, indent = 2): string {
  const pad = " ".repeat(indent);
  return `${pad}• ${text}`;
}
