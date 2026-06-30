export type NotificationKind =
  | "pending"
  | "mentions"
  | "tasks"
  | "snooze"
  | "new_messages"
  | "refresh_ok"
  | "refresh_fail"
  | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string;
  createdAt: number;
  read: boolean;
}

const STORAGE_KEY = "sinal:notifications:v1";
const MAX_ITEMS = 40;

function load(): AppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppNotification[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function save(items: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function readNotifications(): AppNotification[] {
  return load();
}

export function persistNotifications(items: AppNotification[]) {
  save(items);
}

export function makeNotificationId(kind: NotificationKind, suffix: string): string {
  return `${kind}:${suffix}`;
}

export function upsertNotification(
  items: AppNotification[],
  next: Omit<AppNotification, "read"> & { read?: boolean },
): AppNotification[] {
  const withoutDup = items.filter((n) => n.id !== next.id);
  const created: AppNotification = {
    ...next,
    read: next.read ?? false,
  };
  return [created, ...withoutDup].slice(0, MAX_ITEMS);
}

export function unreadCount(items: AppNotification[]): number {
  return items.filter((n) => !n.read).length;
}

export const DESKTOP_NOTIF_KEY = "sinal:desktop-notifications";

export function desktopNotificationsEnabled(): boolean {
  return localStorage.getItem(DESKTOP_NOTIF_KEY) === "1";
}

export function setDesktopNotificationsEnabled(on: boolean) {
  localStorage.setItem(DESKTOP_NOTIF_KEY, on ? "1" : "0");
}
