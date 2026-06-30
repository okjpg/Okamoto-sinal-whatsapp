// Hand-written typed API client for the Sinal backend (api-server at /api).
// The backend routes are hand-written (not OpenAPI codegen), so these hooks are
// the contract for the frontend. Import everything from "@/lib/api".

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });
  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg =
      (isJson && body && (body.error as string)) || res.statusText;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* ----------------------------- Types ----------------------------- */

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string | null;
  isOwner?: boolean;
}

export interface UserProfile {
  email: string | null;
  tenantId: string;
  isOwner: boolean;
  memberSince: string | null;
  smtpConfigured: boolean;
}

export interface SmtpSettingsStatus {
  configured: boolean;
  storedInDb: boolean;
  envFilePath: string | null;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  userMasked: string | null;
  fromEmail: string | null;
  fromName: string;
}

export type RefreshStatus = "running" | "completed" | "failed";
export type RefreshTrigger = "manual" | "scheduled" | "webhook" | "quick";
export interface RefreshJobResult {
  label: string;
  script: string;
  code: number;
}
export interface RefreshRun {
  id: string;
  tenantId: string;
  status: RefreshStatus;
  trigger: RefreshTrigger;
  startedAt: string;
  finishedAt: string | null;
  jobs: RefreshJobResult[] | null;
  error: string | null;
}

export interface SentimentRow {
  sentiment: string;
  count: number;
}
export interface CategoryRow {
  category: string;
  count: number;
}
export interface VolumeRow {
  day: string;
  received: number;
  sent: number;
}
export interface TopContact {
  phone: string;
  name: string | null;
  messages: number;
  received: number;
  sent: number;
  last_at: string | null;
}
export interface TrendingRow {
  topic: string;
  count: number;
}
export interface UnansweredItem {
  phone: string;
  name: string | null;
  text: string | null;
  last_at: string | null;
  category: string | null;
  summary: string | null;
  requires_reply: boolean | null;
}
export interface GroupUnansweredItem {
  chat_id: string;
  chat_name: string | null;
  name: string | null;
  text: string | null;
  summary: string | null;
  is_question: boolean | null;
  requires_reply: boolean | null;
  last_at: string | null;
  message_id: string;
}
export type InviteStatus = "aberto" | "resolvido" | "ignorado";
export interface InviteItem {
  message_id: string;
  category: string | null;
  summary: string | null;
  topics: string[] | null;
  direction: string | null;
  name: string | null;
  phone: string | null;
  at: string | null;
  text: string | null;
  message_count: number;
  status: InviteStatus;
  contact_id: string | null;
}
export interface ResponseTime {
  avg_minutes: number | null;
  median_minutes: number | null;
  sample: number;
  work_window?: {
    start_hour: number;
    end_hour: number;
    tz: string;
    weekdays_only: boolean;
  };
}
export interface VolumeSparkPoint {
  day: string;
  received: number;
}
export interface VolumeSummary {
  current: number;
  previous: number;
  pctChange: number;
  avgPerDay: number;
  days: number;
  sparkline: VolumeSparkPoint[];
}
export interface IntelligencePerson {
  name: string | null;
  count: number;
}
export interface IntelligenceRow {
  topic: string;
  count: number;
  prev_count: number;
  person_count: number;
  people: IntelligencePerson[];
}
export interface TopicExample {
  message_id: string;
  direction: string;
  message_created_at: string | null;
  sender_name: string | null;
  text: string | null;
}
export interface TopicGroup {
  chat_id: string;
  chat_name: string;
  message_count: number;
}
export interface PendingTask {
  id: string;
  title: string | null;
  direction: "mine" | "theirs" | null;
  due_at: string | null;
}
export interface PendingContact {
  chat_id: string;
  name: string | null;
  contact_id: string | null;
  unanswered: boolean;
  last_text: string | null;
  last_at: string | null;
  category: string | null;
  summary: string | null;
  open_tasks: number;
  tasks: PendingTask[];
  reason: string;
}
export interface ThreadMessage {
  message_id: string;
  direction: string;
  message_created_at: string | null;
  text: string | null;
}
export interface OverviewResp {
  received: number;
  sent: number;
  audios: number;
  images: number;
  documents: number;
  groups: number;
  audioMinutes: number | null;
}
export interface VolumeComparePoint {
  offset: number;
  day: string;
  current: number;
  previous: number;
}
export interface VolumeCompare {
  days: number;
  current: number;
  previous: number;
  pctChange: number;
  series: VolumeComparePoint[];
}
export interface ContentIdea {
  topic: string;
  count: number;
  person_count: number;
  question_count: number;
}
export interface GroupTopic {
  topic: string;
  count: number;
  group_count: number;
}
export interface VipContact {
  id: string;
  display_name: string | null;
  primary_phone: string | null;
  description: string | null;
  dominant_category: string | null;
  last_interaction_at: string | null;
  open_tasks: number;
  labels: ContactLabel[];
}

export interface Topic {
  id: string;
  label: string;
  scope: string | null;
  period_start: string | null;
  period_end: string | null;
  person_count: number | null;
  message_count: number | null;
  trend: string | null;
  summary: string | null;
  group_count: number;
}
export interface TopicGroupRef {
  chat_id: string;
  name: string | null;
  message_count: number | null;
}
export interface TopicExcerpt {
  message_id: string;
  chat_name: string | null;
  sender_name: string | null;
  message_created_at: string | null;
  text: string | null;
}
export interface TopicDetail {
  topic: Record<string, unknown>;
  groups: TopicGroupRef[];
  excerpts: TopicExcerpt[];
}

export interface Group {
  chat_id: string;
  name: string | null;
  message_count: number;
  participants: number;
  last_activity_at: string | null;
  is_support: boolean;
}
export interface GroupExcerpt {
  message_id: string;
  sender_name: string | null;
  message_created_at: string | null;
  text: string | null;
}
export interface GroupDigest {
  digest: Record<string, unknown> | null;
  recentExcerpts: GroupExcerpt[];
}

export interface Mention {
  id: string;
  mention_type: string | null;
  sentiment: string | null;
  created_at: string | null;
  entity_name: string | null;
  entity_type: string | null;
  sender_name: string | null;
  chat_name: string | null;
  contact_phone: string | null;
  message_created_at: string | null;
  text: string | null;
}
export interface MentionKpi {
  mention_type: string | null;
  count: number;
}
export interface MentionsResp {
  mentions: Mention[];
  kpis: MentionKpi[];
}

export interface Entity {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  aliases: string[] | null;
  mention_count: number;
  created_at?: string | null;
}

export interface ContactLabel {
  id: string;
  name: string | null;
  color: string | null;
}
export interface Label {
  id: string;
  name: string | null;
  color: string | null;
  contact_count: number;
}
export interface Contact {
  id: string;
  tenant_id: string;
  display_name: string | null;
  email: string | null;
  description: string | null;
  primary_phone: string | null;
  source: string | null;
  google_resource_name: string | null;
  dominant_category: string | null;
  last_interaction_at: string | null;
  open_tasks: number;
  msg_count: number;
  labels: ContactLabel[];
  ai_analysis?: string | null;
  ai_analysis_at?: string | null;
  ai_analysis_msg_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}
export interface ContactMessage {
  message_id: string;
  direction: string;
  message_created_at: string | null;
  text: string | null;
}

export interface ContactMetricsTopic {
  topic: string;
  count: number;
}
export interface ContactMetrics {
  total: number;
  sent: number;
  received: number;
  days: number;
  first_at: string | null;
  last_at: string | null;
  topics: ContactMetricsTopic[];
}
export interface ContactLink {
  message_id: string;
  direction: string;
  message_created_at: string | null;
  url: string;
}
export interface ContactAnalysis {
  analysis: string | null;
  generatedAt: string | null;
  messageCount: number | null;
}

export interface ContactListFilters {
  label?: string;
  q?: string;
  category?: string;
  hasTasks?: boolean;
  sort?: "last_interaction" | "volume" | "name";
}

export interface Task {
  id: string;
  tenant_id: string;
  contact_id: string | null;
  title: string;
  note: string | null;
  direction: "mine" | "theirs" | null;
  source_message_id: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string | null;
  contact_name: string | null;
}

export interface SavedItem {
  id: string;
  tenant_id: string;
  kind: string;
  source_type: string | null;
  source_id: string | null;
  text: string | null;
  created_at: string | null;
}

export interface MediaTypeRow {
  raw_type: string;
  total: number;
  group_count: number;
  private_count: number;
}
export interface MediaSummary {
  total: number;
  byType: MediaTypeRow[];
}
export interface MediaBreakdownRow {
  chat_id: string;
  name: string | null;
  total: number;
  audio: number;
  image: number;
  document: number;
  sticker: number;
  video: number;
  last_at: string | null;
}
export type MediaGranularity = "day" | "week" | "month";
export interface MediaTimeseriesPoint {
  bucket: string;
  total: number;
  audio: number;
  image: number;
  document: number;
  sticker: number;
  video: number;
}
export interface MediaTypeStat {
  key: string;
  total: number;
  inbound: number;
  outbound: number;
  group_count: number;
  private_count: number;
}
export interface MediaStats {
  range: { min_at: string | null; max_at: string | null };
  byType: MediaTypeStat[];
}
export interface MediaMessagesFilter {
  type?: string;
  scope?: "private" | "group";
  chatId?: string;
  direction?: "inbound" | "outbound";
}
export interface MediaMessage {
  message_id: string;
  direction: string;
  message_created_at: string | null;
  chat_id: string;
  chat_name: string | null;
  sender: string | null;
  type: string;
  text: string | null;
}

/* ----------------------------- Query keys ----------------------------- */

export interface SearchPerson {
  id: string;
  name: string | null;
  phone: string | null;
  last_at: string | null;
}
export interface SearchGroup {
  chat_id: string;
  name: string | null;
  message_count: number;
}
export interface SearchTopic {
  id: string;
  label: string;
  scope: string | null;
  message_count: number | null;
}
export interface SearchResp {
  people: SearchPerson[];
  groups: SearchGroup[];
  topics: SearchTopic[];
}

export const qk = {
  me: ["auth", "me"] as const,
  overview: (days?: number) => ["metrics", "overview", days] as const,
  categories: (days?: number) =>
    ["metrics", "private", "categories", days] as const,
  sentiment: ["metrics", "private", "sentiment"] as const,
  volume: (days?: number) => ["metrics", "private", "volume", days] as const,
  volumeSummary: (days?: number) =>
    ["metrics", "private", "volume-summary", days] as const,
  volumeCompare: (days?: number) =>
    ["metrics", "private", "volume-compare", days] as const,
  contentIdeas: (days?: number) =>
    ["metrics", "private", "content-ideas", days] as const,
  groupTopics: (days?: number) =>
    ["metrics", "groups", "topics", days] as const,
  vip: ["contacts", "vip"] as const,
  responseTime: (days?: number) =>
    ["metrics", "private", "response-time", days] as const,
  intelligence: (days?: number, limit?: number) =>
    ["metrics", "private", "intelligence", days, limit] as const,
  topicExamples: (topic?: string, days?: number) =>
    ["metrics", "private", "topic-examples", topic, days] as const,
  groupTopicExamples: (topic?: string, days?: number) =>
    ["metrics", "groups", "topic-examples", topic, days] as const,
  pending: (days?: number) => ["metrics", "private", "pending", days] as const,
  thread: (chatId?: string) =>
    ["metrics", "private", "thread", chatId] as const,
  topContacts: (limit?: number) =>
    ["metrics", "private", "top-contacts", limit] as const,
  trending: (limit?: number) =>
    ["metrics", "private", "trending", limit] as const,
  unanswered: (limit?: number) =>
    ["metrics", "private", "unanswered", limit] as const,
  groupUnanswered: (limit?: number) =>
    ["metrics", "groups", "unanswered", limit] as const,
  invites: (days?: number) => ["metrics", "private", "invites", days] as const,
  labels: ["labels"] as const,
  topics: (scope?: string, crossgroup?: boolean) =>
    ["topics", scope, crossgroup] as const,
  topic: (id: string) => ["topics", id] as const,
  groups: (limit?: number) => ["groups", limit] as const,
  groupDigest: (chatId: string) => ["groups", chatId, "digest"] as const,
  mentions: (entity?: string, type?: string, includeSupport?: boolean) =>
    ["mentions", entity, type, includeSupport ?? false] as const,
  entities: ["entities"] as const,
  contacts: ["contacts"] as const,
  contactsList: (f: ContactListFilters) => ["contacts", "list", f] as const,
  contactMessages: (id: string) => ["contacts", id, "messages"] as const,
  contactMetrics: (id: string) => ["contacts", id, "metrics"] as const,
  contactLinks: (id: string) => ["contacts", id, "links"] as const,
  contactAnalysis: (id: string) => ["contacts", id, "analysis"] as const,
  contactTasks: (id: string) => ["contacts", id, "tasks"] as const,
  tasks: (filter?: string) => ["tasks", filter] as const,
  saved: (kind?: string) => ["saved", kind] as const,
  mediaSummary: ["media", "summary"] as const,
  mediaStats: ["media", "stats"] as const,
  mediaTimeseries: (g: string) => ["media", "timeseries", g] as const,
  mediaByContact: (limit?: number) => ["media", "by-contact", limit] as const,
  mediaByGroup: (limit?: number) => ["media", "by-group", limit] as const,
  mediaMessages: (f: MediaMessagesFilter | null) => ["media", "messages", f] as const,
  googleStatus: ["google", "status"] as const,
  googleCalendarEvents: (days?: number) => ["google", "calendar", "events", days ?? 14] as const,
  evolutionStatus: ["evolution", "status"] as const,
  search: (q: string) => ["search", q] as const,
  refreshStatus: ["refresh", "status"] as const,
  refreshLive: ["refresh", "live"] as const,
};

/* ----------------------------- Auth ----------------------------- */

export function useMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => apiFetch<{ user: AuthUser }>("/auth/me"),
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiFetch<{ user: { id: string; email: string | null; tenantId: string } }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: (data) => {
      qc.setQueryData(qk.me, {
        user: {
          userId: data.user.id,
          tenantId: data.user.tenantId,
          email: data.user.email,
        },
      });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["auth", "profile"],
    queryFn: () => apiFetch<UserProfile>("/auth/profile"),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) =>
      apiFetch<{ ok: true }>("/auth/password", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: { email: string }) =>
      apiFetch<{ ok: true; message?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: {
      token: string;
      newPassword: string;
      confirmPassword: string;
    }) =>
      apiFetch<{ ok: true }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useSmtpSettings(enabled = true) {
  return useQuery({
    queryKey: ["settings", "smtp"],
    queryFn: () => apiFetch<SmtpSettingsStatus>("/settings/smtp"),
    enabled,
  });
}

export function useSaveSmtpSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      host: string;
      port?: number;
      secure?: boolean;
      user?: string;
      password?: string;
      fromEmail: string;
      fromName?: string;
    }) =>
      apiFetch<{
        ok: true;
        configured: boolean;
        storedInDb: boolean;
        envUpdated: boolean;
        envFilePath?: string;
        user?: string | null;
      }>("/settings/smtp", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "smtp"] });
    },
  });
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: (body?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      password?: string;
      fromEmail?: string;
      fromName?: string;
      to?: string;
    }) =>
      apiFetch<{ ok: boolean; to?: string; message?: string }>(
        "/settings/smtp/test",
        {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        },
      ),
  });
}

/* ----------------------------- Data refresh ----------------------------- */

// Polls the status of the incremental data-refresh pipeline. While a cycle is
// running it self-refetches every few seconds so the button reflects live state.
export function useRefreshStatus() {
  return useQuery({
    queryKey: qk.refreshStatus,
    queryFn: () => apiFetch<{ run: RefreshRun | null }>("/refresh/status"),
    refetchInterval: (query) =>
      query.state.data?.run?.status === "running" ? 3000 : false,
  });
}

// Starts a manual refresh. Resolves with the running cycle (HTTP 202); throws
// ApiError 409 ("already_running") when a cycle is already in flight.
export function useStartRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: RefreshRun }>("/refresh", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.refreshStatus });
      qc.invalidateQueries({ queryKey: qk.refreshLive });
    },
  });
}

export interface RefreshLiveStats {
  lastMessageAt: string | null;
  lastRefreshAt: string | null;
  refreshRunning: boolean;
  pendingUnanswered: number;
  openTasks: number;
  mentionsLast24h: number;
  expiredSnoozes: number;
  unenrichedRecent: number;
}

export function useRefreshLive() {
  return useQuery({
    queryKey: qk.refreshLive,
    queryFn: () => apiFetch<RefreshLiveStats>("/refresh/live"),
    refetchInterval: (query) =>
      query.state.data?.refreshRunning ? 3000 : 30_000,
    staleTime: 15_000,
  });
}

export function useStartQuickRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ run: RefreshRun }>("/refresh/quick", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.refreshStatus });
      qc.invalidateQueries({ queryKey: qk.refreshLive });
    },
  });
}

/* ----------------------------- Metrics ----------------------------- */

export function useOverview(days?: number) {
  return useQuery({
    queryKey: qk.overview(days),
    queryFn: () => apiFetch<OverviewResp>(`/metrics/overview${qs({ days })}`),
  });
}

export function useCategories(days?: number) {
  return useQuery({
    queryKey: qk.categories(days),
    queryFn: () =>
      apiFetch<{ categories: CategoryRow[] }>(
        `/metrics/private/categories${qs({ days })}`,
      ),
    select: (d) => d.categories,
  });
}

export function useSentiment() {
  return useQuery({
    queryKey: qk.sentiment,
    queryFn: () =>
      apiFetch<{ sentiment: SentimentRow[] }>("/metrics/private/sentiment"),
    select: (d) => d.sentiment,
  });
}

export function useVolume(days = 90) {
  return useQuery({
    queryKey: qk.volume(days),
    queryFn: () =>
      apiFetch<{ volume: VolumeRow[] }>(
        `/metrics/private/volume${qs({ days })}`,
      ),
    select: (d) => d.volume,
  });
}

export function useTopContacts(limit = 20) {
  return useQuery({
    queryKey: qk.topContacts(limit),
    queryFn: () =>
      apiFetch<{ contacts: TopContact[] }>(
        `/metrics/private/top-contacts${qs({ limit })}`,
      ),
    select: (d) => d.contacts,
  });
}

export function useTrending(limit = 15) {
  return useQuery({
    queryKey: qk.trending(limit),
    queryFn: () =>
      apiFetch<{ trending: TrendingRow[] }>(
        `/metrics/private/trending${qs({ limit })}`,
      ),
    select: (d) => d.trending,
  });
}

export function useUnanswered(limit = 50) {
  return useQuery({
    queryKey: qk.unanswered(limit),
    queryFn: () =>
      apiFetch<{ unanswered: UnansweredItem[] }>(
        `/metrics/private/unanswered${qs({ limit })}`,
      ),
    select: (d) => d.unanswered,
  });
}

export function useGroupUnanswered(limit = 50) {
  return useQuery({
    queryKey: qk.groupUnanswered(limit),
    queryFn: () =>
      apiFetch<{ unanswered: GroupUnansweredItem[] }>(
        `/metrics/groups/unanswered${qs({ limit })}`,
      ),
    select: (d) => d.unanswered,
  });
}

export function useInvites(days?: number) {
  return useQuery({
    queryKey: qk.invites(days),
    queryFn: () =>
      apiFetch<{ invites: InviteItem[] }>(
        `/metrics/private/invites${qs({ days })}`,
      ),
    select: (d) => d.invites,
  });
}

// Persist an invite's triage status (per contact / chat_id). Optimistically
// patches every cached invites list so the Kanban card moves columns instantly.
export function useUpdateInviteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      chatId: string;
      status: InviteStatus;
      sourceMessageId?: string | null;
      direction?: string | null;
      name?: string | null;
      contactId?: string | null;
    }) =>
      apiFetch<{ triage: unknown }>("/metrics/private/invites/status", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["metrics", "private", "invites"] });
      // Snapshot every matching invites cache for rollback on error.
      const prev = qc.getQueriesData<{ invites: InviteItem[] }>({
        queryKey: ["metrics", "private", "invites"],
      });
      // The cache holds the raw queryFn result ({ invites: [...] }); React
      // Query's `select` only transforms what the hook returns to the
      // component, NOT the cached shape (same pattern as patchPendingCaches).
      qc.setQueriesData<{ invites: InviteItem[] }>(
        { queryKey: ["metrics", "private", "invites"] },
        (old) =>
          old
            ? {
                invites: old.invites.map((i) =>
                  i.phone === data.chatId ? { ...i, status: data.status } : i,
                ),
              }
            : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["metrics", "private", "invites"] }),
  });
}

// Convert an invite into a task. Marks the invite 'resolvido' server-side, so we
// refresh both invites and tasks caches.
export function useInviteToTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      chatId: string;
      title: string;
      direction?: "mine" | "theirs" | null;
      sourceMessageId?: string | null;
      contactId?: string | null;
      name?: string | null;
      inviteDirection?: string | null;
      dueAt?: string | null;
    }) =>
      apiFetch<{ task: Task }>("/metrics/private/invites/to-task", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["metrics", "private", "invites"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
    },
  });
}

export function useResponseTime(days?: number) {
  return useQuery({
    queryKey: qk.responseTime(days),
    queryFn: () =>
      apiFetch<ResponseTime>(`/metrics/private/response-time${qs({ days })}`),
  });
}

export function useVolumeSummary(days?: number) {
  return useQuery({
    queryKey: qk.volumeSummary(days),
    queryFn: () =>
      apiFetch<VolumeSummary>(`/metrics/private/volume-summary${qs({ days })}`),
  });
}

export function useVolumeCompare(days?: number) {
  return useQuery({
    queryKey: qk.volumeCompare(days),
    queryFn: () =>
      apiFetch<VolumeCompare>(`/metrics/private/volume-compare${qs({ days })}`),
  });
}

export function useContentIdeas(days?: number) {
  return useQuery({
    queryKey: qk.contentIdeas(days),
    queryFn: () =>
      apiFetch<{ ideas: ContentIdea[] }>(
        `/metrics/private/content-ideas${qs({ days })}`,
      ),
    select: (d) => d.ideas,
  });
}

export function useGroupTopics(days?: number) {
  return useQuery({
    queryKey: qk.groupTopics(days),
    queryFn: () =>
      apiFetch<{ topics: GroupTopic[] }>(
        `/metrics/groups/topics${qs({ days })}`,
      ),
    select: (d) => d.topics,
  });
}

export function useVip() {
  return useQuery({
    queryKey: qk.vip,
    queryFn: () => apiFetch<{ contacts: VipContact[] }>("/contacts/vip"),
    select: (d) => d.contacts,
  });
}

export function useIntelligence(days?: number, limit?: number) {
  return useQuery({
    queryKey: qk.intelligence(days, limit),
    queryFn: () =>
      apiFetch<{ intelligence: IntelligenceRow[] }>(
        `/metrics/private/intelligence${qs({ days, limit })}`,
      ),
    select: (d) => d.intelligence,
  });
}

export function usePending(days?: number) {
  return useQuery({
    queryKey: qk.pending(days),
    queryFn: () =>
      apiFetch<{ pending: PendingContact[] }>(
        `/metrics/private/pending${qs({ days })}`,
      ),
    select: (d) => d.pending,
  });
}

export function usePendingThread(chatId: string | undefined) {
  return useQuery({
    queryKey: qk.thread(chatId),
    queryFn: () =>
      apiFetch<{ messages: ThreadMessage[] }>(
        `/metrics/private/thread${qs({ chatId })}`,
      ),
    enabled: !!chatId,
    select: (d) => d.messages,
  });
}

/* ----------------------- Pending actions (worklist) ----------------------- */

// Mirror the server-side reason string (see metrics.ts /pending) so optimistic
// cache updates keep the drawer/list labels consistent until the refetch lands.
function pendingReason(unanswered: boolean, openTasks: number): string {
  const taskLabel = `${openTasks} tarefa${openTasks > 1 ? "s" : ""} em aberto`;
  if (unanswered && openTasks > 0) return `Não respondida · ${taskLabel}`;
  if (unanswered) return "Mensagem não respondida";
  return taskLabel;
}

// Apply an updater to every cached pending list (one per selected period), then
// drop any contact that no longer has a reason to stay on the worklist.
function patchPendingCaches(
  qc: ReturnType<typeof useQueryClient>,
  updater: (c: PendingContact) => PendingContact,
) {
  qc.setQueriesData<{ pending: PendingContact[] }>(
    { queryKey: ["metrics", "private", "pending"] },
    (old) => {
      if (!old) return old;
      const pending = old.pending
        .map(updater)
        .filter((c) => c.unanswered || c.open_tasks > 0);
      return { pending };
    },
  );
}

// Mark an open task done from the pending drawer, optimistically removing it
// from the worklist (and the contact if it was their last open pendency).
export function useCompletePendingTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId }: { taskId: string; chatId: string }) =>
      apiFetch<{ task: Task }>(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ done: true }),
      }),
    onMutate: async ({ taskId, chatId }) => {
      await qc.cancelQueries({ queryKey: ["metrics", "private", "pending"] });
      const prev = qc.getQueriesData<{ pending: PendingContact[] }>({
        queryKey: ["metrics", "private", "pending"],
      });
      patchPendingCaches(qc, (c) => {
        if (c.chat_id !== chatId) return c;
        const tasks = c.tasks.filter((t) => t.id !== taskId);
        return {
          ...c,
          tasks,
          open_tasks: tasks.length,
          reason: pendingReason(c.unanswered, tasks.length),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["metrics", "private", "pending"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
    },
  });
}

// Snooze (or dismiss) an "unanswered" pendency for a chosen number of days,
// optimistically clearing the unanswered flag (and removing the contact if no
// open tasks remain).
export function useSnoozePending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, days }: { chatId: string; days: number }) =>
      apiFetch<{ ok: true }>("/metrics/private/pending/snooze", {
        method: "POST",
        body: JSON.stringify({ chatId, days }),
      }),
    onMutate: async ({ chatId }) => {
      await qc.cancelQueries({ queryKey: ["metrics", "private", "pending"] });
      const prev = qc.getQueriesData<{ pending: PendingContact[] }>({
        queryKey: ["metrics", "private", "pending"],
      });
      patchPendingCaches(qc, (c) => {
        if (c.chat_id !== chatId) return c;
        return {
          ...c,
          unanswered: false,
          reason: pendingReason(false, c.open_tasks),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["metrics", "private", "pending"] });
    },
  });
}

export function useTopicExamples(topic: string | undefined, days?: number) {
  return useQuery({
    queryKey: qk.topicExamples(topic, days),
    queryFn: () =>
      apiFetch<{ examples: TopicExample[] }>(
        `/metrics/private/topic-examples${qs({ topic, days })}`,
      ),
    enabled: !!topic,
    select: (d) => d.examples,
  });
}

export function useGroupTopicExamples(topic: string | undefined, days?: number) {
  return useQuery({
    queryKey: qk.groupTopicExamples(topic, days),
    queryFn: () =>
      apiFetch<{ examples: TopicExample[]; groups: TopicGroup[] }>(
        `/metrics/groups/topic-examples${qs({ topic, days })}`,
      ),
    enabled: !!topic,
  });
}

/* ----------------------------- Labels (tags) ----------------------------- */

export function useLabels() {
  return useQuery({
    queryKey: qk.labels,
    queryFn: () => apiFetch<{ labels: Label[] }>("/labels"),
    select: (d) => d.labels,
  });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color?: string | null }) =>
      apiFetch<{ label: Label }>("/labels", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labels }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/labels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.labels });
      qc.invalidateQueries({ queryKey: qk.contacts });
    },
  });
}

export function useSeedLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ labels: Label[] }>("/labels/seed", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.labels }),
  });
}

export function useAssignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, labelId }: { contactId: string; labelId: string }) =>
      apiFetch<{ ok: true }>(`/contacts/${contactId}/labels`, {
        method: "POST",
        body: JSON.stringify({ labelId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts });
      qc.invalidateQueries({ queryKey: qk.labels });
    },
  });
}

export function useUnassignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, labelId }: { contactId: string; labelId: string }) =>
      apiFetch<{ ok: true }>(`/contacts/${contactId}/labels/${labelId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts });
      qc.invalidateQueries({ queryKey: qk.labels });
    },
  });
}

/* ----------------------------- Search ----------------------------- */

export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: qk.search(term),
    queryFn: () => apiFetch<SearchResp>(`/search${qs({ q: term })}`),
    enabled: term.length >= 2,
    placeholderData: (prev) => prev,
  });
}

/* ----------------------------- Topics ----------------------------- */

export function useTopics(opts?: { scope?: string; crossgroup?: boolean }) {
  return useQuery({
    queryKey: qk.topics(opts?.scope, opts?.crossgroup),
    queryFn: () =>
      apiFetch<{ topics: Topic[] }>(
        `/topics${qs({ scope: opts?.scope, crossgroup: opts?.crossgroup })}`,
      ),
    select: (d) => d.topics,
  });
}

export function useTopic(
  id: string | undefined,
  options?: Partial<UseQueryOptions<TopicDetail>>,
) {
  return useQuery({
    queryKey: qk.topic(id ?? ""),
    queryFn: () => apiFetch<TopicDetail>(`/topics/${id}`),
    enabled: !!id,
    ...options,
  });
}

/* ----------------------------- Groups ----------------------------- */

export function useGroups(limit = 50) {
  return useQuery({
    queryKey: qk.groups(limit),
    queryFn: () =>
      apiFetch<{ groups: Group[] }>(`/groups${qs({ limit })}`),
    select: (d) => d.groups,
  });
}

export function useGroupDigest(chatId: string | undefined) {
  return useQuery({
    queryKey: qk.groupDigest(chatId ?? ""),
    queryFn: () => apiFetch<GroupDigest>(`/groups/${chatId}/digest`),
    enabled: !!chatId,
  });
}

// Mark / unmark a group as "suporte/ruído" (hidden by default on Mentions).
export function useSetGroupSupport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chatId, isSupport }: { chatId: string; isSupport: boolean }) =>
      apiFetch<{ ok: true }>(`/groups/${chatId}/support`, {
        method: isSupport ? "POST" : "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["mentions"] });
    },
  });
}

/* ----------------------------- Mentions ----------------------------- */

export function useMentions(opts?: {
  entity?: string;
  type?: string;
  includeSupport?: boolean;
}) {
  return useQuery({
    queryKey: qk.mentions(opts?.entity, opts?.type, opts?.includeSupport),
    queryFn: () =>
      apiFetch<MentionsResp>(
        `/mentions${qs({
          entity: opts?.entity,
          type: opts?.type,
          includeSupport: opts?.includeSupport ? 1 : undefined,
        })}`,
      ),
  });
}

/* ----------------------------- Entities ----------------------------- */

export function useEntities() {
  return useQuery({
    queryKey: qk.entities,
    queryFn: () => apiFetch<{ entities: Entity[] }>("/entities"),
    select: (d) => d.entities,
  });
}

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      aliases?: string[];
    }) =>
      apiFetch<{ entity: Entity }>("/entities", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.entities }),
  });
}

export function useUpdateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; type?: string; aliases?: string[] };
    }) =>
      apiFetch<{ entity: Entity }>(`/entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.entities });
      qc.invalidateQueries({ queryKey: ["mentions"] });
    },
  });
}

export function useDeleteEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/entities/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.entities });
      qc.invalidateQueries({ queryKey: ["mentions"] });
    },
  });
}

/* ----------------------------- Contacts ----------------------------- */

export function useContacts(filters: ContactListFilters = {}) {
  return useQuery({
    queryKey: qk.contactsList(filters),
    queryFn: () =>
      apiFetch<{ contacts: Contact[] }>(
        `/contacts${qs({
          label: filters.label,
          q: filters.q,
          category: filters.category,
          hasTasks: filters.hasTasks ? "true" : undefined,
          sort: filters.sort,
        })}`,
      ),
    select: (d) => d.contacts,
  });
}

export function useContactMessages(id: string | undefined) {
  return useQuery({
    queryKey: qk.contactMessages(id ?? ""),
    queryFn: () =>
      apiFetch<{ messages: ContactMessage[] }>(`/contacts/${id}/messages`),
    enabled: !!id,
    select: (d) => d.messages,
  });
}

export function useContactMetrics(id: string | undefined) {
  return useQuery({
    queryKey: qk.contactMetrics(id ?? ""),
    queryFn: () =>
      apiFetch<{ metrics: ContactMetrics }>(`/contacts/${id}/metrics`),
    enabled: !!id,
    select: (d) => d.metrics,
  });
}

export function useContactLinks(id: string | undefined) {
  return useQuery({
    queryKey: qk.contactLinks(id ?? ""),
    queryFn: () =>
      apiFetch<{ links: ContactLink[] }>(`/contacts/${id}/links`),
    enabled: !!id,
    select: (d) => d.links,
  });
}

export function useContactAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: qk.contactAnalysis(id ?? ""),
    queryFn: () =>
      apiFetch<ContactAnalysis>(`/contacts/${id}/analysis`),
    enabled: !!id,
  });
}

export function useGenerateContactAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ContactAnalysis>(`/contacts/${id}/analysis`, { method: "POST" }),
    onSuccess: (data, id) => {
      qc.setQueryData(qk.contactAnalysis(id), data);
      qc.invalidateQueries({ queryKey: qk.contacts });
    },
  });
}

export function useContactTasks(id: string | undefined) {
  return useQuery({
    queryKey: qk.contactTasks(id ?? ""),
    queryFn: () => apiFetch<{ tasks: Task[] }>(`/contacts/${id}/tasks`),
    enabled: !!id,
    select: (d) => d.tasks,
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        displayName?: string;
        email?: string | null;
        description?: string | null;
        primaryPhone?: string | null;
      };
    }) =>
      apiFetch<{ contact: Contact }>(`/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts }),
  });
}

export function usePromoteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { phone: string; displayName?: string }) =>
      apiFetch<{ contact: Contact }>("/contacts/promote", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts }),
  });
}

/* ----------------------------- Tasks ----------------------------- */

export function useTasks(filter?: string) {
  return useQuery({
    queryKey: qk.tasks(filter),
    queryFn: () =>
      apiFetch<{ tasks: Task[] }>(`/tasks${qs({ filter })}`),
    select: (d) => d.tasks,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      note?: string | null;
      contactId?: string | null;
      direction?: "mine" | "theirs" | null;
      sourceMessageId?: string | null;
      dueAt?: string | null;
    }) =>
      apiFetch<{ task: Task }>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    // When the task is linked to a contact, optimistically add it to any open
    // pending worklist for that contact so the drawer list + count update
    // immediately (e.g. a quick "remind me to reply" from the pending drawer).
    onMutate: async (data) => {
      if (!data.contactId) return { prevPending: undefined };
      await qc.cancelQueries({ queryKey: ["metrics", "private", "pending"] });
      const prevPending = qc.getQueriesData<{ pending: PendingContact[] }>({
        queryKey: ["metrics", "private", "pending"],
      });
      const tempId = `temp-${Date.now()}`;
      patchPendingCaches(qc, (c) => {
        if (c.contact_id !== data.contactId) return c;
        const tasks = [
          ...c.tasks,
          {
            id: tempId,
            title: data.title,
            direction: data.direction ?? "mine",
            due_at: data.dueAt ?? null,
          },
        ];
        return {
          ...c,
          tasks,
          open_tasks: tasks.length,
          reason: pendingReason(c.unanswered, tasks.length),
        };
      });
      return { prevPending };
    },
    onError: (_e, _v, ctx) => {
      ctx?.prevPending?.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
      qc.invalidateQueries({ queryKey: ["metrics", "private", "pending"] });
      if (res.task.contact_id) {
        qc.invalidateQueries({
          queryKey: qk.contactTasks(res.task.contact_id),
        });
      }
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        done?: boolean;
        title?: string;
        note?: string | null;
        dueAt?: string | null;
      };
    }) =>
      apiFetch<{ task: Task }>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
      if (res.task.contact_id) {
        qc.invalidateQueries({
          queryKey: qk.contactTasks(res.task.contact_id),
        });
      }
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ task: Task }>(`/tasks/${id}`, {
        method: "DELETE",
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
      qc.invalidateQueries({ queryKey: ["metrics", "private", "pending"] });
      if (res.task.contact_id) {
        qc.invalidateQueries({
          queryKey: qk.contactTasks(res.task.contact_id),
        });
      }
    },
  });
}

export function useClearCompletedTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ tasks: Task[]; deleted: number }>("/tasks/completed", {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: qk.contacts });
      qc.invalidateQueries({ queryKey: ["metrics", "private", "pending"] });
    },
  });
}

/* ----------------------------- Saved ----------------------------- */

export function useSaved(kind?: string) {
  return useQuery({
    queryKey: qk.saved(kind),
    queryFn: () =>
      apiFetch<{ saved: SavedItem[] }>(`/saved${qs({ kind })}`),
    select: (d) => d.saved,
  });
}

export function useCreateSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      kind: string;
      sourceType?: string | null;
      sourceId?: string | null;
      text?: string | null;
    }) =>
      apiFetch<{ saved: SavedItem }>("/saved", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved"] }),
  });
}

export function useDeleteSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/saved/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved"] }),
  });
}

/* ----------------------------- Media ----------------------------- */

export function useMediaSummary() {
  return useQuery({
    queryKey: qk.mediaSummary,
    queryFn: () => apiFetch<MediaSummary>("/media/summary"),
  });
}

export function useMediaStats() {
  return useQuery({
    queryKey: qk.mediaStats,
    queryFn: () => apiFetch<MediaStats>("/media/stats"),
  });
}

export function useMediaTimeseries(granularity: MediaGranularity = "day") {
  return useQuery({
    queryKey: qk.mediaTimeseries(granularity),
    queryFn: () =>
      apiFetch<{ granularity: MediaGranularity; points: MediaTimeseriesPoint[] }>(
        `/media/timeseries${qs({ granularity })}`,
      ),
    select: (d) => d.points,
  });
}

export function useMediaByContact(limit = 50) {
  return useQuery({
    queryKey: qk.mediaByContact(limit),
    queryFn: () =>
      apiFetch<{ contacts: MediaBreakdownRow[] }>(
        `/media/by-contact${qs({ limit })}`,
      ),
    select: (d) => d.contacts,
  });
}

export function useMediaByGroup(limit = 50) {
  return useQuery({
    queryKey: qk.mediaByGroup(limit),
    queryFn: () =>
      apiFetch<{ groups: MediaBreakdownRow[] }>(
        `/media/by-group${qs({ limit })}`,
      ),
    select: (d) => d.groups,
  });
}

export function useMediaMessages(filter: MediaMessagesFilter | null) {
  return useQuery({
    queryKey: qk.mediaMessages(filter),
    queryFn: () =>
      apiFetch<{ total: number; messages: MediaMessage[] }>(
        `/media/messages${qs({ ...(filter ?? {}), limit: 200 })}`,
      ),
    enabled: !!filter,
  });
}

/* ----------------------------- Google Contacts ----------------------------- */

export interface GoogleStatus {
  configured: boolean;
  redirectUri: string | null;
  clientIdMasked: string | null;
  storedInDb: boolean;
  envFilePath: string | null;
  connected: boolean;
  email: string | null;
  contacts: boolean;
  calendar: boolean;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  htmlLink: string | null;
  start: string | null;
  end: string | null;
  allDay: boolean;
  calendarId: string;
  calendarSummary: string | null;
}

export interface GoogleImportResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
}

export function useGoogleStatus() {
  return useQuery({
    queryKey: qk.googleStatus,
    queryFn: () => apiFetch<GoogleStatus>("/google/status"),
    retry: 1,
    staleTime: 10_000,
  });
}

export function useSaveGoogleCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clientId: string; clientSecret: string }) =>
      apiFetch<{
        ok: true;
        configured: boolean;
        clientIdMasked: string | null;
        envUpdated: boolean;
        storedInDb: boolean;
        envFilePath?: string;
        redirectUri: string;
      }>("/google/credentials", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.googleStatus });
    },
  });
}

// Returns the Google consent URL. The frontend must open it in a real browser
// tab (Google cannot be displayed inside the embedded preview iframe). The OAuth
// state is stored server-side so the callback works without cookies.
export type GoogleConnectService = "contacts" | "calendar" | "all";

export function getGoogleConnectUrl(service: GoogleConnectService = "contacts") {
  return apiFetch<{ url: string }>("/google/connect-url", {
    method: "POST",
    body: JSON.stringify({ service }),
  });
}

export function useGoogleDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>("/google/disconnect", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.googleStatus });
      qc.invalidateQueries({ queryKey: ["google", "calendar"] });
    },
  });
}

export function useGoogleImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<GoogleImportResult>("/google/import", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts }),
  });
}

export function useGoogleCalendarEvents(enabled: boolean, days = 14) {
  return useQuery({
    queryKey: qk.googleCalendarEvents(days),
    queryFn: () =>
      apiFetch<{ events: GoogleCalendarEvent[]; count: number; days: number }>(
        `/google/calendar/events${qs({ days })}`,
      ),
    enabled,
    select: (d) => d.events,
  });
}

export function useExportContactToGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true; resourceName: string }>(
        `/google/contacts/${id}/export`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts }),
  });
}

/* ----------------------------- WhatsApp (Evolution API) ----------------------------- */

export interface EvolutionStatus {
  configured: boolean;
  connected: boolean;
  state: string;
  instance: string | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  instanceExists: boolean;
  suggestedInstanceName: string;
}

export interface EvolutionInstancePayload {
  instanceName?: string;
  recreate?: boolean;
}

export interface EvolutionQrcode {
  base64: string | null;
  pairingCode: string | null;
  state: string;
  instance: string;
  webhookRegistered?: boolean;
  webhookConfigured?: boolean;
  created?: boolean;
  alreadyExists?: boolean;
  alreadyConnected?: boolean;
  message?: string | null;
}

export interface EvolutionInstanceResult {
  ok: true;
  instance: string;
  state: string;
  base64: string | null;
  pairingCode: string | null;
  created?: boolean;
  alreadyExists?: boolean;
  message?: string | null;
}

const INSTANCE_STORAGE_KEY = "sinal-evolution-instance";

export function getStoredEvolutionInstance(): string | null {
  try {
    return localStorage.getItem(INSTANCE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredEvolutionInstance(name: string): void {
  try {
    localStorage.setItem(INSTANCE_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}

function instanceQs(instanceName?: string) {
  return instanceName ? qs({ instanceName }) : "";
}

export function useEvolutionStatus(
  instanceName?: string,
  options?: { poll?: boolean },
) {
  return useQuery({
    queryKey: [...qk.evolutionStatus, instanceName ?? "default"],
    queryFn: () =>
      apiFetch<EvolutionStatus>(`/evolution/status${instanceQs(instanceName)}`),
    refetchInterval: options?.poll ? 3000 : false,
    retry: 1,
    staleTime: 5_000,
  });
}

export function useCreateEvolutionInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EvolutionInstancePayload = {}) =>
      apiFetch<EvolutionInstanceResult>("/evolution/instance", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.evolutionStatus }),
  });
}

export function useEvolutionConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EvolutionInstancePayload = {}) =>
      apiFetch<EvolutionQrcode>("/evolution/connect", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.evolutionStatus }),
  });
}

export function useEvolutionDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EvolutionInstancePayload = {}) =>
      apiFetch<{ ok: true }>("/evolution/disconnect", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.evolutionStatus }),
  });
}

export function fetchEvolutionQrcode(instanceName?: string) {
  return apiFetch<EvolutionQrcode>(
    `/evolution/qrcode${instanceQs(instanceName)}`,
  );
}

/* ----------------------------- IA / OpenRouter ----------------------------- */

export type AiSelectionMode =
  | "auto_free"
  | "pick_free"
  | "pick_paid"
  | "by_task";

export type AiTaskType =
  | "classify"
  | "cluster"
  | "mentions"
  | "contact_analysis"
  | "audio"
  | "image"
  | "video";

export interface TenantAiSettings {
  mode: AiSelectionMode;
  selectedFreeModels: string[];
  selectedPaidModels: string[];
  byTask: Partial<Record<AiTaskType, string>>;
}

export interface OpenRouterModelDto {
  id: string;
  name: string;
  description?: string;
  isFree: boolean;
  modality: string;
  contextLength?: number;
  useCase?: string;
  useCaseLabel?: string;
  qualityRank?: number | null;
  qualityLabel?: string | null;
  pricingPrompt?: number;
  pricingCompletion?: number;
  priceLabel?: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  storedInDb: boolean;
  apiKeyMasked: string | null;
  baseUrl: string | null;
  modelsCount?: number;
  freeCount?: number;
  paidCount?: number;
  latencyMs?: number;
  label?: string | null;
  error?: string;
  message?: string;
}

export function useAiStatus() {
  return useQuery({
    queryKey: ["ai", "status"],
    queryFn: () =>
      apiFetch<{
        openRouterConfigured: boolean;
        apiKeyMasked: string | null;
        baseUrl: string;
        storedInDb: boolean;
        envFilePath: string;
      }>("/ai/status"),
  });
}

export function useAiSettings() {
  return useQuery({
    queryKey: ["ai", "settings"],
    queryFn: () =>
      apiFetch<{
        settings: TenantAiSettings;
        resolvedModels: Record<string, string | null>;
        autoFreeDefaults: string[];
      }>("/ai/settings"),
  });
}

export function useAiModels(
  filter: "all" | "free" | "paid" = "all",
  enabled = true,
) {
  return useQuery({
    queryKey: ["ai", "models", filter],
    queryFn: () =>
      apiFetch<{ models: OpenRouterModelDto[]; fetchedAt?: string }>(
        `/ai/models?filter=${filter}`,
      ),
    enabled,
    staleTime: 60_000,
  });
}

export function useTestAiConnection() {
  return useMutation({
    mutationFn: (body?: { apiKey?: string; baseUrl?: string }) =>
      apiFetch<AiConnectionTestResult>("/ai/test-connection", {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
  });
}

export function useSaveAiCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { apiKey: string; baseUrl?: string }) =>
      apiFetch<{
        ok: true;
        openRouterConfigured: boolean;
        apiKeyMasked: string | null;
        baseUrl: string;
        envUpdated: boolean;
        storedInDb: boolean;
        envFilePath?: string;
      }>("/ai/credentials", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai"] });
    },
  });
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<TenantAiSettings>) =>
      apiFetch<{ settings: TenantAiSettings }>("/ai/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai"] });
    },
  });
}
