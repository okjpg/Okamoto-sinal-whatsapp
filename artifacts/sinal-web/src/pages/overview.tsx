import { useState } from "react";
import { useLocation } from "wouter";
import {
  useOverview,
  useVolumeCompare,
  useIntelligence,
  useContentIdeas,
  useGroupTopics,
  useVip,
  useTasks,
  useUpdateTask,
  useTopicExamples,
  useGroupTopicExamples,
  type VolumeComparePoint,
} from "@/lib/api";
import { useTimeWindow } from "@/lib/timeWindow";
import {
  Loader2,
  Inbox,
  Send,
  Mic,
  ImageIcon,
  FileText,
  Users2,
  Flame,
  Lightbulb,
  Star,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ListChecks,
  Clock,
  Check,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

function fmtDay(iso: string, withWeekday = false): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(withWeekday ? { weekday: "short" } : {}),
  }).replace(/\./g, "");
}

function timeAgo(iso: string | null): string {
  if (!iso) return "sem registro";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `há ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

/* ------------------------- Topic drill-down drawer ------------------------- */

function TopicDrawer({
  topic,
  days,
  scope = "private",
  onClose,
}: {
  topic: string | null;
  days: number;
  scope?: "private" | "group";
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const privateExamples = useTopicExamples(
    scope === "private" ? topic || undefined : undefined,
    days,
  );
  const groupExamples = useGroupTopicExamples(
    scope === "group" ? topic || undefined : undefined,
    days,
  );
  const isLoading =
    scope === "group" ? groupExamples.isLoading : privateExamples.isLoading;
  const examples =
    scope === "group" ? groupExamples.data?.examples : privateExamples.data;
  const groups = scope === "group" ? groupExamples.data?.groups : undefined;
  return (
    <Sheet open={!!topic} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[460px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
        <SheetHeader className="flex flex-row items-start gap-[12px] p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
          <div className="flex-1 min-w-0">
            <SheetTitle className="font-display font-semibold text-[18px] leading-[1.25] break-words">
              {topic}
            </SheetTitle>
            <SheetDescription className="text-[13px] text-[var(--muted)] mt-1">
              Exemplos reais de contexto nos últimos {days} dias
            </SheetDescription>
          </div>
        </SheetHeader>
        <div className="p-[20px_22px] overflow-y-auto flex-1">
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto my-4" />
          ) : (
            <>
            {scope === "group" && !!groups?.length && (
              <div className="mb-[20px]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--muted-2)] mb-[10px] flex items-center gap-[6px]">
                  <Users2 className="w-3.5 h-3.5" /> Grupos onde aparece
                </div>
                <div className="flex flex-col gap-[6px]">
                  {groups.map((g) => (
                    <button
                      key={g.chat_id}
                      onClick={() => {
                        onClose();
                        setLocation(`/grupos?g=${encodeURIComponent(g.chat_id)}`);
                      }}
                      className="flex items-center gap-[10px] w-full text-left bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] px-[12px] py-[9px] transition-[0.14s] hover:border-[var(--accent-dim)] hover:-translate-y-0.5 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--text)] truncate">
                          {g.chat_name}
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--accent)] bg-[var(--accent-glow)] px-[8px] py-[2px] rounded-[20px] shrink-0">
                        {g.message_count.toLocaleString("pt-BR")} msgs
                      </span>
                      <ArrowUpRight className="w-3.5 h-3.5 text-[var(--muted-2)] shrink-0 group-hover:text-[var(--accent)]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-[12px]">
              {examples?.map((m, i) => (
                <div key={i} className="flex gap-[11px] py-[2px]">
                  <div
                    className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 text-[10.5px] font-bold ${m.direction === "inbound" ? "bg-[var(--surface-3)] text-[var(--info)]" : "bg-[rgba(53,224,216,0.1)] text-[var(--accent)]"}`}
                  >
                    {m.direction === "inbound" ? "IN" : "OUT"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--muted)] mb-[2px] truncate">
                      {m.sender_name || "—"}
                    </div>
                    <div className="text-[13px] leading-[1.4] text-[var(--text)]">
                      {m.text}
                    </div>
                    <div className="font-mono text-[10.5px] text-[var(--muted-2)] mt-[3px]">
                      {m.message_created_at
                        ? new Date(m.message_created_at).toLocaleString("pt-BR")
                        : ""}
                    </div>
                  </div>
                </div>
              ))}
              {!examples?.length && (
                <div className="text-[13px] text-[var(--muted-2)] py-4 text-center">
                  Sem exemplos no período.
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------- Cards --------------------------------- */

function HardCard({
  icon,
  label,
  value,
  hint,
  dot,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
  dot: string;
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[18px]">
      <div className="text-[12px] text-[var(--muted)] mb-[10px] flex items-center gap-[7px]">
        <span
          className="w-[7px] h-[7px] rounded-full"
          style={{ backgroundColor: dot }}
        />
        <span className="inline-flex items-center gap-[6px]">
          {icon} {label}
        </span>
      </div>
      <div className="font-display font-semibold text-[34px] leading-none tracking-[-0.01em]">
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="mt-[9px] text-[12px] text-[var(--muted)]">{hint}</div>
    </div>
  );
}

function VolumeTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: VolumeComparePoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] px-[10px] py-[7px] text-[11.5px] shadow-lg">
      <div className="font-semibold text-[var(--text)] mb-[3px]">
        {fmtDay(p.day, true)}
      </div>
      <div className="flex items-center gap-[6px] text-[var(--accent)]">
        <span className="w-[8px] h-[8px] rounded-full bg-[var(--accent)]" />
        atual: {p.current}
      </div>
      <div className="flex items-center gap-[6px] text-[var(--muted)]">
        <span className="w-[8px] h-[8px] rounded-full bg-[var(--muted-2)]" />
        anterior: {p.previous}
      </div>
    </div>
  );
}

/* -------------------------------- Word cloud ------------------------------ */

const CLOUD_COLORS = [
  "var(--accent)",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#4ADE80",
];

function WordCloud({
  items,
  onPick,
}: {
  items: { topic: string; count: number }[];
  onPick?: (topic: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
        Sem temas suficientes no período.
      </div>
    );
  }
  const max = Math.max(1, ...items.map((i) => i.count));
  const min = Math.min(...items.map((i) => i.count));
  const span = Math.max(1, max - min);
  return (
    <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px]">
      {items.map((it, i) => {
        const t = (it.count - min) / span;
        const size = 13 + Math.round(t * 17);
        const opacity = 0.55 + t * 0.45;
        const color = CLOUD_COLORS[i % CLOUD_COLORS.length];
        const Comp = onPick ? "button" : "span";
        return (
          <Comp
            key={it.topic}
            onClick={onPick ? () => onPick(it.topic) : undefined}
            title={`${it.count} menções`}
            className={`font-display font-semibold leading-none tracking-[-0.01em] transition-[0.14s] ${onPick ? "cursor-pointer hover:opacity-100 hover:underline" : ""}`}
            style={{ fontSize: `${size}px`, color, opacity }}
          >
            {it.topic}
          </Comp>
        );
      })}
    </div>
  );
}

/* -------------------------------- Page ----------------------------------- */

export default function Overview() {
  const [, navigate] = useLocation();
  const { days, option } = useTimeWindow();
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedGroupTopic, setSelectedGroupTopic] = useState<string | null>(
    null,
  );

  const { data: overview, isLoading: loadingOverview } = useOverview(days);
  const { data: volume, isLoading: loadingVolume } = useVolumeCompare(days);
  const { data: intelligence, isLoading: loadingIntel } = useIntelligence(
    days,
    40,
  );
  const { data: ideas } = useContentIdeas(days);
  const { data: groupTopics } = useGroupTopics(days);
  const { data: vip } = useVip();
  const { data: tasks } = useTasks("open");
  const updateTask = useUpdateTask();
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const completeTask = (id: string) => {
    setCompleting((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      updateTask.mutate(
        { id, data: { done: true } },
        {
          onError: () =>
            setCompleting((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            }),
        },
      );
    }, 260);
  };

  if (loadingOverview || loadingVolume || loadingIntel) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  const intel = intelligence ?? [];
  const trending = intel.slice(0, 10);
  const maxTrend = Math.max(1, ...trending.map((t) => t.count));
  const movers = intel
    .map((t) => ({
      topic: t.topic,
      count: t.count,
      delta: t.count - t.prev_count,
      isNew: t.prev_count === 0,
    }))
    .filter((t) => t.delta !== 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 8);
  const groupCloud = (groupTopics ?? []).map((t) => ({
    topic: t.topic,
    count: t.count,
  }));
  const openTasks = tasks ?? [];

  const up = (volume?.pctChange ?? 0) >= 0;
  const audioMinutes = overview?.audioMinutes ?? null;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      {/* Hard data */}
      <div className="grid grid-cols-3 gap-4">
        <HardCard
          icon={<Inbox className="w-3.5 h-3.5 text-[var(--accent)]" />}
          label={`Recebidas (${option.short})`}
          value={overview?.received ?? 0}
          hint={`mensagens recebidas nos ${option.label}`}
          dot="var(--accent)"
        />
        <HardCard
          icon={<Send className="w-3.5 h-3.5 text-[var(--info)]" />}
          label="Enviadas"
          value={overview?.sent ?? 0}
          hint="respostas enviadas por mim"
          dot="var(--info)"
        />
        <HardCard
          icon={<Mic className="w-3.5 h-3.5 text-[var(--warn)]" />}
          label="Áudios"
          value={overview?.audios ?? 0}
          hint={
            audioMinutes != null
              ? `${audioMinutes} min de áudio`
              : "mensagens de voz no privado"
          }
          dot="var(--warn)"
        />
        <HardCard
          icon={<ImageIcon className="w-3.5 h-3.5 text-[#60A5FA]" />}
          label="Imagens"
          value={overview?.images ?? 0}
          hint={`fotos e imagens nos ${option.label}`}
          dot="#60A5FA"
        />
        <HardCard
          icon={<FileText className="w-3.5 h-3.5 text-[#FBBF24]" />}
          hint={`PDFs e arquivos nos ${option.label}`}
          label="Documentos"
          value={overview?.documents ?? 0}
          dot="#FBBF24"
        />
        <HardCard
          icon={<Users2 className="w-3.5 h-3.5 text-[var(--accent)]" />}
          label="Grupos"
          value={overview?.groups ?? 0}
          hint={`grupos com atividade nos ${option.label}`}
          dot="var(--accent-dim)"
        />
      </div>

      {/* Open tasks */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
            <ListChecks className="w-3.5 h-3.5" /> Tarefas em aberto
          </h3>
          <button
            onClick={() => navigate("/salvos")}
            className="text-[11px] text-[var(--accent)] hover:underline inline-flex items-center gap-[3px] cursor-pointer"
          >
            ver todas <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
        <div className="flex flex-col">
          {openTasks.slice(0, 6).map((task) => {
            const overdue =
              !!task.due_at && new Date(task.due_at) < new Date();
            const leaving = completing.has(task.id);
            return (
              <div
                key={task.id}
                className={`flex items-start gap-[11px] overflow-hidden border-b border-[var(--border-soft)] last:border-0 transition-all duration-300 ease-out ${
                  leaving
                    ? "max-h-0 py-0 opacity-0 translate-x-2"
                    : "max-h-[120px] py-[10px] opacity-100 translate-x-0"
                }`}
              >
                <button
                  onClick={() => completeTask(task.id)}
                  disabled={leaving}
                  aria-label="Concluir tarefa"
                  className={`w-[18px] h-[18px] border-[1.5px] rounded-[6px] shrink-0 cursor-pointer mt-[1px] flex items-center justify-center transition-colors duration-150 ${
                    leaving
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-[var(--border)] hover:border-[var(--accent)]"
                  }`}
                >
                  {leaving && <Check className="w-3 h-3" strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium leading-[1.4] text-[var(--text)]">
                    {task.title}
                  </div>
                  <div className="flex items-center gap-[12px] mt-[3px] text-[11.5px] text-[var(--muted)]">
                    {task.contact_name &&
                      (task.contact_id ? (
                        <button
                          onClick={() =>
                            navigate(`/contatos?c=${task.contact_id}`)
                          }
                          className="truncate hover:text-[var(--accent)] cursor-pointer"
                        >
                          {task.contact_name}
                        </button>
                      ) : (
                        <span className="truncate">{task.contact_name}</span>
                      ))}
                    {task.due_at && (
                      <span
                        className={`inline-flex items-center gap-[4px] shrink-0 ${overdue ? "text-[var(--danger)]" : ""}`}
                      >
                        <Clock className="w-3 h-3" />
                        {new Date(task.due_at).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!openTasks.length && (
            <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
              Nenhuma tarefa em aberto.
            </div>
          )}
        </div>
      </div>

      {/* Volume comparison + Trending */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
              Volume recebido · período atual vs anterior
            </h3>
            <div
              className={`text-[12px] font-semibold inline-flex items-center gap-[4px] ${up ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}
            >
              {up ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {up ? "+" : ""}
              {volume?.pctChange ?? 0}%
            </div>
          </div>
          <div className="flex items-center gap-[16px] mb-3 text-[11.5px]">
            <span className="inline-flex items-center gap-[6px] text-[var(--text)]">
              <span className="w-[10px] h-[3px] rounded-full bg-[var(--accent)]" />
              atual {volume?.current ?? 0}
            </span>
            <span className="inline-flex items-center gap-[6px] text-[var(--muted)]">
              <span className="w-[10px] h-[3px] rounded-full bg-[var(--muted-2)]" />
              anterior {volume?.previous ?? 0}
            </span>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={volume?.series ?? []}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="ovCurrent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tickFormatter={(d) => fmtDay(d)}
                  tick={{ fontSize: 10, fill: "var(--muted-2)" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <Tooltip
                  content={<VolumeTooltip />}
                  cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="previous"
                  stroke="var(--muted-2)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  fill="none"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="current"
                  stroke="var(--accent)"
                  strokeWidth={2.2}
                  fill="url(#ovCurrent)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <Flame className="w-3.5 h-3.5" /> Top pautas no privado
            </h3>
            <span className="text-[11px] text-[var(--muted-2)]">por volume</span>
          </div>
          <div className="flex flex-col">
            {trending.map((item, i) => (
              <button
                key={item.topic}
                onClick={() => setSelectedTopic(item.topic)}
                className="flex items-center gap-3 py-[9px] border-b border-[var(--border-soft)] last:border-0 text-left cursor-pointer hover:opacity-90"
              >
                <div className="font-mono text-[12px] text-[var(--muted-2)] w-4 shrink-0">
                  {(i + 1).toString().padStart(2, "0")}
                </div>
                <div className="flex-1 text-[13px] font-medium truncate text-[var(--text)]">
                  {item.topic}
                </div>
                <div
                  className="h-[6px] rounded-full bg-gradient-to-r from-[var(--accent-dim)] to-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)] shrink-0"
                  style={{ width: `${Math.max(8, (item.count / maxTrend) * 64)}px` }}
                />
                <div className="font-mono text-[12px] font-medium text-[var(--ok)] w-[38px] text-right shrink-0">
                  {item.count}
                </div>
              </button>
            ))}
            {!trending.length && (
              <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
                Sem pautas no período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Momentum + Content ideas */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <TrendingUp className="w-3.5 h-3.5" /> Pautas em movimento
            </h3>
            <span className="text-[11px] text-[var(--muted-2)]">
              vs período anterior
            </span>
          </div>
          <div className="flex flex-col">
            {movers.map((item) => {
              const rising = item.delta > 0;
              return (
                <button
                  key={item.topic}
                  onClick={() => setSelectedTopic(item.topic)}
                  className="flex items-center gap-3 py-[9px] border-b border-[var(--border-soft)] last:border-0 text-left cursor-pointer hover:opacity-90"
                >
                  <div className="flex-1 text-[13px] font-medium truncate text-[var(--text)]">
                    {item.topic}
                  </div>
                  <span
                    className={`inline-flex items-center gap-[3px] text-[11px] font-semibold px-[8px] py-[2px] rounded-full shrink-0 ${
                      item.isNew
                        ? "bg-[rgba(53,224,216,0.12)] text-[var(--accent)]"
                        : rising
                          ? "bg-[rgba(74,222,128,0.12)] text-[var(--ok)]"
                          : "bg-[rgba(248,113,113,0.12)] text-[var(--danger)]"
                    }`}
                  >
                    {item.isNew ? (
                      "novo"
                    ) : rising ? (
                      <>
                        <TrendingUp className="w-3 h-3" />+{item.delta}
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3" />
                        {item.delta}
                      </>
                    )}
                  </span>
                  <div className="font-mono text-[12px] text-[var(--muted-2)] w-[34px] text-right shrink-0">
                    {item.count}
                  </div>
                </button>
              );
            })}
            {!movers.length && (
              <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
                Sem mudanças relevantes no período.
              </div>
            )}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <Lightbulb className="w-3.5 h-3.5" /> Ideias de conteúdo
            </h3>
            <span className="text-[11px] text-[var(--muted-2)]">
              temas com perguntas
            </span>
          </div>
          <div className="flex flex-col gap-[10px]">
            {(ideas ?? []).map((idea) => (
              <button
                key={idea.topic}
                onClick={() => setSelectedTopic(idea.topic)}
                className="flex items-start gap-[11px] text-left rounded-[9px] p-[10px] -mx-[10px] hover:bg-[var(--surface-2)] transition-[0.14s] cursor-pointer"
              >
                <div className="w-[26px] h-[26px] rounded-[8px] bg-[rgba(251,191,36,0.13)] text-[var(--warn)] flex items-center justify-center shrink-0">
                  <Lightbulb className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text)] leading-[1.3]">
                    {idea.topic}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] mt-[3px]">
                    {idea.person_count}{" "}
                    {idea.person_count === 1 ? "pessoa trouxe" : "pessoas trouxeram"}
                    {idea.question_count > 0
                      ? ` · ${idea.question_count} pergunta${idea.question_count > 1 ? "s" : ""}`
                      : ""}
                  </div>
                </div>
              </button>
            ))}
            {!ideas?.length && (
              <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
                Sem ideias derivadas no período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group cloud + VIP */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <Users2 className="w-3.5 h-3.5" /> Temas nos grupos
            </h3>
            <span className="text-[11px] text-[var(--muted-2)]">
              o que circula nos grupos
            </span>
          </div>
          <WordCloud items={groupCloud} onPick={setSelectedGroupTopic} />
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <Star className="w-3.5 h-3.5 text-[var(--warn)]" /> VIP
            </h3>
            <span className="text-[11px] text-[var(--muted-2)]">
              {(vip ?? []).length} contato{(vip ?? []).length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-col">
            {(vip ?? []).map((c, i) => (
              <button
                key={c.id}
                onClick={() => navigate(`/contatos?c=${c.id}`)}
                className="flex items-center gap-3 py-[10px] px-2 -mx-2 rounded-[9px] hover:bg-[var(--surface-2)] cursor-pointer transition-[0.14s] text-left"
              >
                <div
                  className="w-[32px] h-[32px] rounded-full text-[#0A0A0C] flex items-center justify-center text-[12px] font-semibold shrink-0"
                  style={{
                    backgroundColor: CLOUD_COLORS[i % CLOUD_COLORS.length],
                  }}
                >
                  {(c.display_name || c.primary_phone || "?")
                    .substring(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate text-[var(--text)]">
                    {c.display_name || c.primary_phone || "Contato"}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)] truncate mt-[2px]">
                    {timeAgo(c.last_interaction_at)}
                    {c.open_tasks > 0 ? ` · ${c.open_tasks} tarefa${c.open_tasks > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                {c.open_tasks > 0 && (
                  <span className="inline-flex items-center gap-[4px] text-[11px] px-[8px] py-[2px] rounded-full bg-[rgba(53,224,216,0.12)] text-[var(--accent)] font-medium shrink-0">
                    <ListChecks className="w-3 h-3" /> {c.open_tasks}
                  </span>
                )}
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--muted-2)] shrink-0" />
              </button>
            ))}
            {!vip?.length && (
              <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
                Nenhum contato marcado como VIP. Adicione a tag "VIP" em Contatos.
              </div>
            )}
          </div>
        </div>
      </div>

      <TopicDrawer
        topic={selectedTopic}
        days={days}
        onClose={() => setSelectedTopic(null)}
      />
      <TopicDrawer
        topic={selectedGroupTopic}
        days={days}
        scope="group"
        onClose={() => setSelectedGroupTopic(null)}
      />
    </div>
  );
}
