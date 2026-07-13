import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRefreshLive, useRefreshStatus, type RefreshLiveStats } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  type AppNotification,
  type NotificationKind,
  desktopNotificationsEnabled,
  makeNotificationId,
  persistNotifications,
  readNotifications,
  setDesktopNotificationsEnabled,
  unreadCount,
  upsertNotification,
} from "@/lib/notifications-store";

interface PushOptions {
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  dedupeKey: string;
  toast?: boolean;
  toastVariant?: "default" | "destructive";
  markUnread?: boolean;
  browser?: boolean;
}

interface NotificationContextValue {
  items: AppNotification[];
  unread: number;
  push: (opts: PushOptions) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  desktopEnabled: boolean;
  setDesktopEnabled: (on: boolean) => Promise<boolean>;
  requestDesktopPermission: () => Promise<NotificationPermission | "unsupported">;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function showBrowserNotification(title: string, body: string, href?: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!desktopNotificationsEnabled()) return;

  const n = new Notification(title, {
    body,
    tag: `sinal-${title}`,
    icon: "/favicon-48.png",
  });
  n.onclick = () => {
    window.focus();
    if (href) window.location.assign(href);
    n.close();
  };
}

function deltaIncreased(prev: number, next: number): boolean {
  return next > prev;
}

function seedFromLive(live: RefreshLiveStats, push: NotificationContextValue["push"]) {
  if (live.pendingUnanswered > 0) {
    push({
      kind: "pending",
      title: "DMs aguardando resposta",
      body: `${live.pendingUnanswered} conversa(s) marcada(s) como pendente.`,
      href: "/privado",
      dedupeKey: `pending:${live.pendingUnanswered}`,
      toast: false,
      markUnread: true,
    });
  }
  if (live.mentionsLast24h > 0) {
    push({
      kind: "mentions",
      title: "Menções recentes",
      body: `${live.mentionsLast24h} menção(ões) nas últimas 24 horas.`,
      href: "/mencoes",
      dedupeKey: `mentions:${live.mentionsLast24h}`,
      toast: false,
      markUnread: true,
    });
  }
  if (live.openTasks > 0) {
    push({
      kind: "tasks",
      title: "Tasks abertas",
      body: `${live.openTasks} tarefa(s) em aberto.`,
      href: "/salvos",
      dedupeKey: `tasks:${live.openTasks}`,
      toast: false,
      markUnread: true,
    });
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { data: live } = useRefreshLive();
  const { data: refreshStatus } = useRefreshStatus();
  const run = refreshStatus?.run ?? null;

  const [items, setItems] = useState<AppNotification[]>(() => readNotifications());
  const [desktopEnabled, setDesktopEnabledState] = useState(() =>
    desktopNotificationsEnabled(),
  );

  const liveBaseline = useRef(false);
  const prevLive = useRef<RefreshLiveStats | null>(null);
  const prevRunStatus = useRef<string | null>(null);
  const seenSnoozeCount = useRef<number | null>(null);

  useEffect(() => {
    persistNotifications(items);
  }, [items]);

  const push = useCallback(
    (opts: PushOptions) => {
      const id = makeNotificationId(opts.kind, opts.dedupeKey);
      setItems((prev) =>
        upsertNotification(prev, {
          id,
          kind: opts.kind,
          title: opts.title,
          body: opts.body,
          href: opts.href,
          createdAt: Date.now(),
          read: opts.markUnread === false,
        }),
      );

      if (opts.toast) {
        toast({
          variant: opts.toastVariant ?? "default",
          title: opts.title,
          description: opts.body,
        });
      }

      if (opts.browser !== false && (opts.toast || opts.browser)) {
        showBrowserNotification(opts.title, opts.body, opts.href);
      }
    },
    [toast],
  );

  useEffect(() => {
    if (!live) return;

    if (!liveBaseline.current) {
      liveBaseline.current = true;
      seedFromLive(live, push);
      prevLive.current = live;
      seenSnoozeCount.current = live.expiredSnoozes;
      return;
    }

    const prev = prevLive.current!;

    if (deltaIncreased(prev.pendingUnanswered, live.pendingUnanswered)) {
      const diff = live.pendingUnanswered - prev.pendingUnanswered;
      push({
        kind: "pending",
        title: "Nova pendência no Privado",
        body: `${diff} conversa(s) passaram a exigir resposta (${live.pendingUnanswered} no total).`,
        href: "/privado",
        dedupeKey: String(live.pendingUnanswered),
        toast: true,
      });
    }

    if (deltaIncreased(prev.mentionsLast24h, live.mentionsLast24h)) {
      push({
        kind: "mentions",
        title: "Nova menção detectada",
        body: `${live.mentionsLast24h} menção(ões) nas últimas 24 horas.`,
        href: "/mencoes",
        dedupeKey: String(live.mentionsLast24h),
        toast: true,
      });
    }

    if (deltaIncreased(prev.openTasks, live.openTasks)) {
      push({
        kind: "tasks",
        title: "Nova task aberta",
        body: `${live.openTasks} tarefa(s) aguardando ação.`,
        href: "/salvos",
        dedupeKey: String(live.openTasks),
        toast: true,
      });
    }

    if (deltaIncreased(prev.unenrichedRecent, live.unenrichedRecent)) {
      push({
        kind: "new_messages",
        title: "Mensagens novas",
        body: `${live.unenrichedRecent} mensagem(ns) recente(s) aguardando classificação.`,
        href: "/",
        dedupeKey: String(live.unenrichedRecent),
        toast: true,
      });
    }

    if (
      live.expiredSnoozes > 0 &&
      live.expiredSnoozes !== seenSnoozeCount.current
    ) {
      seenSnoozeCount.current = live.expiredSnoozes;
      push({
        kind: "snooze",
        title: "Snooze expirado",
        body: `${live.expiredSnoozes} conversa(s) voltaram para a fila de pendências.`,
        href: "/privado",
        dedupeKey: String(live.expiredSnoozes),
        toast: true,
      });
    }

    prevLive.current = live;
  }, [live, push]);

  useEffect(() => {
    const prev = prevRunStatus.current;
    const curr = run?.status ?? null;
    if (prev === "running" && curr && curr !== "running") {
      if (curr === "completed") {
        push({
          kind: "refresh_ok",
          title: "Dados atualizados",
          body: "As abas refletem as mensagens novas.",
          href: "/",
          dedupeKey: run?.id ?? String(Date.now()),
          toast: true,
          markUnread: false,
        });
      } else if (curr === "failed") {
        push({
          kind: "refresh_fail",
          title: "Falha na atualização",
          body: run?.error ?? "Não foi possível concluir a atualização.",
          dedupeKey: run?.id ?? String(Date.now()),
          toast: true,
          toastVariant: "destructive",
        });
      }
    }
    prevRunStatus.current = curr;
  }, [run?.status, run?.error, run?.id, push]);

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const requestDesktopPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as const;
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return Notification.requestPermission();
  }, []);

  const setDesktopEnabled = useCallback(
    async (on: boolean) => {
      if (on) {
        const perm = await requestDesktopPermission();
        if (perm !== "granted") {
          setDesktopEnabledState(false);
          setDesktopNotificationsEnabled(false);
          return false;
        }
      }
      setDesktopEnabledState(on);
      setDesktopNotificationsEnabled(on);
      return true;
    },
    [requestDesktopPermission],
  );

  const value = useMemo(
    () => ({
      items,
      unread: unreadCount(items),
      push,
      markRead,
      markAllRead,
      clearAll,
      desktopEnabled,
      setDesktopEnabled,
      requestDesktopPermission,
    }),
    [
      items,
      push,
      markRead,
      markAllRead,
      clearAll,
      desktopEnabled,
      setDesktopEnabled,
      requestDesktopPermission,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
