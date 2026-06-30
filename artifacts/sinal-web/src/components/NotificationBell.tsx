import { useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  CheckCheck,
  MessageCircle,
  AtSign,
  ListTodo,
  Clock,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import type { AppNotification, NotificationKind } from "@/lib/notifications-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const kindIcon: Record<NotificationKind, typeof Bell> = {
  pending: MessageCircle,
  mentions: AtSign,
  tasks: ListTodo,
  snooze: Clock,
  new_messages: Sparkles,
  refresh_ok: RefreshCw,
  refresh_fail: AlertTriangle,
  system: Bell,
};

function formatWhen(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return new Date(ts).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function NotificationRow({
  item,
  onRead,
}: {
  item: AppNotification;
  onRead: (id: string) => void;
}) {
  const Icon = kindIcon[item.kind] ?? Bell;
  const inner = (
    <div
      className={`flex gap-3 px-3 py-2.5 rounded-[9px] transition-colors ${
        item.read
          ? "opacity-70 hover:bg-[var(--surface-2)]"
          : "bg-[rgba(53,224,216,0.08)] border border-[rgba(53,224,216,0.18)] hover:bg-[rgba(53,224,216,0.12)]"
      }`}
    >
      <div className="mt-0.5 shrink-0 w-8 h-8 rounded-[8px] bg-[var(--surface-3)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)]">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] font-semibold leading-snug">{item.title}</p>
          <span className="text-[10px] text-[var(--muted-2)] shrink-0">
            {formatWhen(item.createdAt)}
          </span>
        </div>
        <p className="text-[12px] text-[var(--muted)] mt-0.5 leading-snug">
          {item.body}
        </p>
      </div>
      {!item.read ? (
        <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0 mt-2 shadow-[0_0_8px_var(--accent-glow)]" />
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={() => onRead(item.id)}
        className="block no-underline text-inherit"
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onRead(item.id)}
    >
      {inner}
    </button>
  );
}

export default function NotificationBell() {
  const {
    items,
    unread,
    markRead,
    markAllRead,
    clearAll,
    desktopEnabled,
    setDesktopEnabled,
  } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notificações${unread > 0 ? `, ${unread} não lidas` : ""}`}
          className="relative w-[34px] h-[34px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center text-[var(--muted)] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent-dim)] transition-colors outline-none data-[state=open]:border-[var(--accent-dim)] data-[state=open]:text-[var(--accent)]"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--accent)] text-[#06201e] text-[10px] font-bold leading-4 text-center">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[360px] max-w-[calc(100vw-24px)] p-0 border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-soft)]">
          <DropdownMenuLabel className="p-0 text-[13px] font-semibold">
            Notificações
          </DropdownMenuLabel>
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] text-[11px] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Ler tudo
              </button>
            ) : null}
            {items.length > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-[7px] text-[11px] text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-2)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-[var(--muted-2)] mb-2" />
              <p className="text-[13px] text-[var(--muted)]">Nenhuma notificação</p>
              <p className="text-[11px] text-[var(--muted-2)] mt-1">
                Alertas de pendências, menções e refresh aparecem aqui.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <NotificationRow key={item.id} item={item} onRead={markRead} />
            ))
          )}
        </div>

        <DropdownMenuSeparator className="bg-[var(--border-soft)]" />
        <DropdownMenuItem
          className="text-[12px] cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            void setDesktopEnabled(!desktopEnabled);
          }}
        >
          <span className="flex-1">Alertas do sistema (macOS/Windows)</span>
          <span
            className={`text-[11px] font-semibold ${
              desktopEnabled ? "text-[var(--ok)]" : "text-[var(--muted-2)]"
            }`}
          >
            {desktopEnabled ? "Ativo" : "Off"}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
