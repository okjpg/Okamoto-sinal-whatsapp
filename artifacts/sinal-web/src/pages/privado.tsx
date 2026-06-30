import { useState } from "react";
import { useLocation } from "wouter";
import {
  useInvites,
  useUpdateInviteStatus,
  useInviteToTask,
  useResponseTime,
  useVolumeSummary,
  useIntelligence,
  useTopicExamples,
  useLabels,
  usePending,
  usePendingThread,
  useTasks,
  useCreateSaved,
  useCompletePendingTask,
  useSnoozePending,
  useCreateTask,
  type VolumeSparkPoint,
  type PendingContact,
  type InviteItem,
} from "@/lib/api";
import {
  Loader2,
  Mic,
  Handshake,
  Lightbulb,
  Bookmark,
  Timer,
  Inbox,
  ListChecks,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  AlertCircle,
  ChevronRight,
  CheckSquare,
  ArrowUpRight,
  Tag,
  Send,
  CornerUpLeft,
  Check,
  BellOff,
  Plus,
  ListPlus,
  X,
  MessageSquare,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const PERIODS = [7, 14, 30] as const;
type Period = (typeof PERIODS)[number];

// Colorful but on-brand palette for charts.
const PALETTE = [
  "#35E0D8",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
  "#4ADE80",
  "#FB923C",
  "#38BDF8",
];

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "agora";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function formatMinutes(min: number | null): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}

function Sparkline({ data }: { data: VolumeSparkPoint[] }) {
  if (!data.length) {
    return (
      <div className="h-[34px] flex items-end text-[10px] text-[var(--muted-2)]">
        sem dados
      </div>
    );
  }
  const w = 150;
  const h = 34;
  const max = Math.max(1, ...data.map((d) => d.received));
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((d, i) => {
      const x = i * step;
      const y = h - (d.received / max) * (h - 3) - 1.5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${h} ${points} ${((data.length - 1) * step).toFixed(1)},${h}`;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="w-full h-[34px]"
    >
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#spark-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TopicDrawer({
  topic,
  days,
  onClose,
  onSave,
}: {
  topic: string | null;
  days: number;
  onClose: () => void;
  onSave: (topic: string) => void;
}) {
  const { data: examples, isLoading } = useTopicExamples(
    topic || undefined,
    days,
  );
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
          {topic && (
            <button
              onClick={() => onSave(topic)}
              className="mb-[18px] text-[12px] font-semibold text-[var(--accent)] bg-[rgba(53,224,216,0.14)] border-none px-[12px] py-[6px] rounded-[8px] cursor-pointer inline-flex items-center gap-[6px] hover:bg-[rgba(53,224,216,0.22)]"
            >
              <Bookmark className="w-3.5 h-3.5" /> Salvar pauta
            </button>
          )}
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto my-4" />
          ) : (
            <div className="space-y-[12px]">
              {examples?.map((m, i) => (
                <div
                  key={i}
                  className="flex gap-[11px] py-[2px] last:border-none"
                >
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
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function defaultInviteTaskTitle(inv: InviteItem): string {
  const who = inv.name || inv.phone || "contato";
  return inv.direction === "outbound"
    ? `Acompanhar convite enviado para ${who}`
    : `Responder convite de ${who}`;
}

function InviteThreadSheet({
  chatId,
  name,
  onClose,
}: {
  chatId: string | null;
  name: string | null;
  onClose: () => void;
}) {
  const { data: thread, isLoading } = usePendingThread(chatId ?? undefined);

  return (
    <Sheet open={!!chatId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[440px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
        <SheetHeader className="p-[20px_22px_16px] border-b border-[var(--border-soft)] space-y-0">
          <SheetTitle className="font-display font-semibold text-[17px] truncate">
            {name || chatId || "Conversa"}
          </SheetTitle>
          <SheetDescription className="text-[12.5px] text-[var(--muted)] mt-1">
            Histórico recente da conversa
          </SheetDescription>
        </SheetHeader>
        <div className="p-[18px_22px] overflow-y-auto flex-1 flex flex-col gap-[10px]">
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
            </div>
          )}
          {!isLoading &&
            (thread ?? []).map((m) => (
              <div
                key={m.message_id}
                className={`max-w-[92%] rounded-[10px] px-[12px] py-[8px] text-[12.5px] leading-[1.45] ${
                  m.direction === "outbound"
                    ? "self-end bg-[rgba(53,224,216,0.12)] border border-[rgba(53,224,216,0.2)]"
                    : "self-start bg-[var(--surface-2)] border border-[var(--border-soft)]"
                }`}
              >
                <div className="text-[10px] text-[var(--muted-2)] mb-[4px] font-mono">
                  {m.direction === "outbound" ? "Você" : "Contato"}
                </div>
                {m.text}
              </div>
            ))}
          {!isLoading && (thread ?? []).length === 0 && (
            <div className="py-8 text-center text-[13px] text-[var(--muted-2)]">
              Sem mensagens recentes.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InviteOpenRow({
  inv,
  inviteDir,
  onOpen,
}: {
  inv: InviteItem;
  inviteDir: "recebidos" | "feitos";
  onOpen: (inv: InviteItem) => void;
}) {
  const updateStatus = useUpdateInviteStatus();
  const toTask = useInviteToTask();
  const chatId = inv.phone ?? "";
  const busy = updateStatus.isPending || toTask.isPending;

  function patchStatus(status: "resolvido" | "ignorado") {
    if (!chatId) return;
    updateStatus.mutate({
      chatId,
      status,
      sourceMessageId: inv.message_id,
      direction: inv.direction,
      name: inv.name,
      contactId: inv.contact_id,
    });
  }

  function convertToTask() {
    if (!chatId) return;
    toTask.mutate({
      chatId,
      title: defaultInviteTaskTitle(inv),
      direction: inv.direction === "outbound" ? "theirs" : "mine",
      sourceMessageId: inv.message_id,
      contactId: inv.contact_id,
      name: inv.name,
      inviteDirection: inv.direction,
    });
  }

  function openConversation() {
    if (!chatId) return;
    onOpen(inv);
  }

  return (
    <div className="py-[11px] border-b border-[var(--border-soft)] last:border-none">
      <div className="flex items-start gap-[12px]">
        <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center bg-[var(--surface-3)] text-[var(--accent)] shrink-0">
          {inviteDir === "feitos" ? (
            <Send className="w-4 h-4" />
          ) : inv.category === "convite" ? (
            <Mic className="w-4 h-4" />
          ) : (
            <Handshake className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13.5px] truncate flex items-center gap-[6px]">
            {inviteDir === "feitos" && (
              <span className="text-[11px] text-[var(--muted-2)] font-normal inline-flex items-center gap-[3px] shrink-0">
                <CornerUpLeft className="w-3 h-3" /> para
              </span>
            )}
            {inv.name || inv.phone}
            <span className="text-[var(--muted-2)] font-normal">
              — {inv.category}
            </span>
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-[2px] line-clamp-2">
            {inv.summary || inv.text}
          </div>
        </div>
        <span className="font-mono text-[10.5px] text-[var(--muted-2)] whitespace-nowrap shrink-0 pt-[2px]">
          {timeAgo(inv.at)}
        </span>
      </div>
      <div className="flex items-center gap-[6px] mt-[8px] ml-[42px] flex-wrap">
        <button
          type="button"
          disabled={busy || !chatId}
          onClick={() => patchStatus("resolvido")}
          className="inline-flex items-center gap-[4px] text-[10.5px] font-semibold text-[var(--ok)] bg-[rgba(74,222,128,0.1)] border border-[rgba(74,222,128,0.25)] rounded-[6px] px-[8px] py-[4px] cursor-pointer hover:bg-[rgba(74,222,128,0.16)] disabled:opacity-50 transition-[0.14s]"
        >
          <Check className="w-3 h-3" /> Resolver
        </button>
        <button
          type="button"
          disabled={busy || !chatId}
          onClick={() => patchStatus("ignorado")}
          className="inline-flex items-center gap-[4px] text-[10.5px] font-semibold text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[6px] px-[8px] py-[4px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--border)] disabled:opacity-50 transition-[0.14s]"
        >
          <X className="w-3 h-3" /> Ignorar
        </button>
        <button
          type="button"
          disabled={busy || !chatId}
          onClick={convertToTask}
          className="inline-flex items-center gap-[4px] text-[10.5px] font-semibold text-[var(--accent)] bg-[rgba(53,224,216,0.1)] border border-[rgba(53,224,216,0.22)] rounded-[6px] px-[8px] py-[4px] cursor-pointer hover:bg-[rgba(53,224,216,0.18)] disabled:opacity-50 transition-[0.14s]"
        >
          {toTask.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <ListPlus className="w-3 h-3" />
          )}
          Tarefa
        </button>
        <button
          type="button"
          disabled={!chatId}
          onClick={openConversation}
          className="inline-flex items-center gap-[4px] text-[10.5px] font-semibold text-[var(--info)] bg-[rgba(96,165,250,0.1)] border border-[rgba(96,165,250,0.22)] rounded-[6px] px-[8px] py-[4px] cursor-pointer hover:bg-[rgba(96,165,250,0.16)] disabled:opacity-50 transition-[0.14s]"
        >
          <MessageSquare className="w-3 h-3" /> Abrir
        </button>
      </div>
    </div>
  );
}

const SNOOZE_OPTIONS = [
  { days: 1, label: "1 dia" },
  { days: 3, label: "3 dias" },
  { days: 7, label: "7 dias" },
] as const;

function PendingDrawer({
  contact,
  onClose,
}: {
  contact: PendingContact | null;
  onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const { data: thread, isLoading } = usePendingThread(
    contact?.chat_id || undefined,
  );
  const completeTask = useCompletePendingTask();
  const snoozePending = useSnoozePending();
  const createTask = useCreateTask();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const busy =
    completeTask.isPending || snoozePending.isPending || createTask.isPending;

  function addTask() {
    const title = taskTitle.trim();
    if (!title || !contact?.contact_id) return;
    createTask.mutate(
      {
        title,
        contactId: contact.contact_id,
        direction: "mine",
        dueAt: taskDue ? new Date(taskDue).toISOString() : null,
      },
      {
        onSuccess: () => {
          setTaskTitle("");
          setTaskDue("");
        },
      },
    );
  }
  return (
    <Sheet open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[460px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
        <SheetHeader className="flex flex-row items-start gap-[12px] p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
          <div className="flex-1 min-w-0">
            <SheetTitle className="font-display font-semibold text-[18px] leading-[1.25] truncate">
              {contact?.name || contact?.chat_id || "Contato"}
            </SheetTitle>
            <SheetDescription className="text-[13px] text-[var(--muted)] mt-1">
              {contact?.reason}
            </SheetDescription>
          </div>
        </SheetHeader>

        <div className="p-[20px_22px] overflow-y-auto flex-1">
          {contact && (
            <div className="flex flex-wrap items-center gap-[8px] mb-[20px]">
              {contact.unanswered && (
                <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold px-[9px] py-[3px] rounded-[7px] bg-[rgba(248,113,113,0.13)] text-[var(--danger)]">
                  <AlertCircle className="w-3 h-3" /> Não respondida
                </span>
              )}
              {contact.category && (
                <span className="text-[11px] px-[9px] py-[3px] rounded-[7px] font-medium bg-[rgba(96,165,250,0.13)] text-[var(--info)]">
                  {contact.category}
                </span>
              )}
              {contact.open_tasks > 0 && (
                <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold px-[9px] py-[3px] rounded-[7px] bg-[rgba(53,224,216,0.14)] text-[var(--accent)]">
                  <ListChecks className="w-3 h-3" /> {contact.open_tasks} tarefa
                  {contact.open_tasks > 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}

          {contact?.summary && (
            <div className="mb-[22px]">
              <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">
                Resumo da pendência
              </h4>
              <div className="text-[13px] text-[var(--text)] leading-[1.5] border border-[var(--border-soft)] p-[12px] rounded-[8px] bg-[var(--surface-2)]">
                {contact.summary}
              </div>
            </div>
          )}

          {contact?.unanswered && (
            <div className="mb-[22px]">
              <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">
                Adiar pendência
              </h4>
              <div className="flex flex-wrap items-center gap-[8px]">
                <span className="text-[12px] text-[var(--muted)] inline-flex items-center gap-[6px]">
                  <BellOff className="w-3.5 h-3.5" /> Silenciar por
                </span>
                {SNOOZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    disabled={busy}
                    onClick={() =>
                      snoozePending.mutate({
                        chatId: contact.chat_id,
                        days: opt.days,
                      })
                    }
                    className="text-[12px] font-semibold px-[11px] py-[5px] rounded-[8px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] cursor-pointer transition-[0.14s] hover:border-[var(--accent-dim)] hover:text-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {contact && contact.tasks.length > 0 && (
            <div className="mb-[22px]">
              <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">
                Tarefas relacionadas
              </h4>
              <div className="space-y-[8px]">
                {contact.tasks.map((tk) => (
                  <div
                    key={tk.id}
                    className="flex items-start gap-[10px] bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[9px] p-[10px_12px]"
                  >
                    <CheckSquare className="w-4 h-4 text-[var(--accent)] shrink-0 mt-[1px]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--text)] leading-[1.35]">
                        {tk.title}
                      </div>
                      <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[3px]">
                        {tk.direction === "mine"
                          ? "minha"
                          : tk.direction === "theirs"
                            ? "dela(e)"
                            : "—"}
                        {tk.due_at
                          ? ` · vence ${new Date(tk.due_at).toLocaleDateString("pt-BR")}`
                          : ""}
                      </div>
                    </div>
                    <button
                      disabled={busy}
                      onClick={() =>
                        completeTask.mutate({
                          taskId: tk.id,
                          chatId: contact.chat_id,
                        })
                      }
                      title="Marcar como concluída"
                      className="shrink-0 inline-flex items-center gap-[5px] text-[11.5px] font-semibold px-[10px] py-[5px] rounded-[7px] bg-[rgba(53,224,216,0.14)] text-[var(--accent)] border-none cursor-pointer transition-[0.14s] hover:bg-[rgba(53,224,216,0.22)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-3.5 h-3.5" /> Concluir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {contact?.contact_id && (
            <div className="mb-[22px]">
              <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">
                Adicionar tarefa
              </h4>
              <div className="flex flex-col gap-[8px]">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTask();
                  }}
                  placeholder="Ex.: lembrar de responder o orçamento"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[9px] px-[12px] py-[9px] text-[13px] text-[var(--text)] placeholder:text-[var(--muted-2)] outline-none focus:border-[var(--accent-dim)]"
                />
                <div className="flex items-center gap-[8px]">
                  <input
                    type="date"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                    className="flex-1 bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[9px] px-[12px] py-[8px] text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
                  />
                  <button
                    disabled={busy || !taskTitle.trim()}
                    onClick={addTask}
                    className="shrink-0 inline-flex items-center gap-[5px] text-[12.5px] font-semibold px-[14px] py-[9px] rounded-[9px] bg-[var(--accent)] text-[#06201e] border-none cursor-pointer transition-[0.14s] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-[11px] uppercase tracking-[0.08em] text-[var(--muted-2)] mb-[10px]">
              Mensagens de origem
            </h4>
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto my-4" />
            ) : (
              <div className="space-y-[10px]">
                {thread?.map((m, i) => (
                  <div
                    key={i}
                    className="flex gap-[11px] py-[2px] last:border-none"
                  >
                    <div
                      className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center shrink-0 text-[10.5px] font-bold ${m.direction === "inbound" ? "bg-[var(--surface-3)] text-[var(--info)]" : "bg-[rgba(53,224,216,0.1)] text-[var(--accent)]"}`}
                    >
                      {m.direction === "inbound" ? "IN" : "OUT"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] leading-[1.4] text-[var(--text)]">
                        {m.text}
                      </div>
                      <div className="font-mono text-[10.5px] text-[var(--muted-2)] mt-[3px]">
                        {m.message_created_at
                          ? new Date(m.message_created_at).toLocaleString(
                              "pt-BR",
                            )
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
                {!thread?.length && (
                  <div className="text-[13px] text-[var(--muted-2)] py-4 text-center">
                    Sem mensagens no histórico.
                  </div>
                )}
              </div>
            )}
          </div>

          {contact?.contact_id && (
            <button
              onClick={() => navigate(`/contatos?c=${contact.contact_id}`)}
              className="mt-[18px] w-full px-[12px] py-[9px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)] hover:text-[var(--accent)] inline-flex items-center justify-center gap-[6px]"
            >
              Abrir no CRM <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Privado() {
  const [, navigate] = useLocation();
  const [days, setDays] = useState<Period>(7);
  const [inviteDir, setInviteDir] = useState<"recebidos" | "feitos">(
    "recebidos",
  );
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [inviteThread, setInviteThread] = useState<{
    chatId: string;
    name: string | null;
  } | null>(null);

  const { data: invites, isLoading: loadingInv } = useInvites(days);
  const { data: responseTime, isLoading: loadingRt } = useResponseTime(days);
  const { data: volume, isLoading: loadingVol } = useVolumeSummary(days);
  const { data: intelligence, isLoading: loadingInt } = useIntelligence(
    days,
    40,
  );
  const { data: labels, isLoading: loadingLabels } = useLabels();
  const { data: pending, isLoading: loadingPending } = usePending(days);
  const { data: mineTasks } = useTasks("mine");
  const createSaved = useCreateSaved();

  const loading =
    loadingInv ||
    loadingRt ||
    loadingVol ||
    loadingInt ||
    loadingLabels ||
    loadingPending;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  // Derive the open drawer contact from the live pending list (not a snapshot)
  // so optimistic mutations (complete task / snooze) flow straight into it; when
  // the contact drops off the worklist the drawer closes on its own.
  const selected =
    (selectedChatId && pending?.find((p) => p.chat_id === selectedChatId)) ||
    null;

  const intel = intelligence ?? [];
  const maxIntel = Math.max(1, ...intel.map((t) => t.count));
  // Detailed ranked list shows the strongest pautas; cloud uses the full set.
  const topIntel = intel.slice(0, 10);

  const sortedLabels = [...(labels ?? [])].sort(
    (a, b) => b.contact_count - a.contact_count,
  );
  const maxLabel = Math.max(1, ...sortedLabels.map((l) => l.contact_count));

  const minePending = (mineTasks || []).filter((t) => !t.done).length;

  const received = (invites || []).filter((i) => i.direction === "inbound");
  const sent = (invites || []).filter((i) => i.direction === "outbound");
  // "Em aberto" reflects only invites not yet triaged as resolved/ignored.
  const openReceived = received.filter((i) => i.status === "aberto");
  const openSent = sent.filter((i) => i.status === "aberto");
  // The quick list mirrors the triage board: only still-open invites show here;
  // resolved/ignored ones live on /salvos.
  const shownInvites = inviteDir === "recebidos" ? openReceived : openSent;
  const triagedCount = (invites || []).filter(
    (i) => i.status !== "aberto",
  ).length;

  const up = (volume?.pctChange ?? 0) >= 0;

  function saveTopic(topic: string) {
    createSaved.mutate({
      kind: "topic",
      sourceType: "intelligence",
      text: topic,
    });
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-400">
      {/* Header + period filter */}
      <div className="flex items-center justify-between flex-wrap gap-[12px]">
        <h2 className="font-display font-semibold text-[16px] flex items-center gap-[8px]">
          <Inbox className="w-4 h-4 text-[var(--accent)]" /> Inteligência do
          privado — o que falam comigo
        </h2>
        <div className="inline-flex items-center bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[3px] gap-[2px]">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-[14px] py-[6px] rounded-[8px] text-[12.5px] font-semibold cursor-pointer transition-[0.14s] ${
                days === p
                  ? "bg-[var(--accent)] text-[#06201e]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-[14px] mb-[6px]">
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px]">
          <div className="text-[11.5px] text-[var(--muted)] mb-[9px] flex items-center gap-[6px]">
            <span className="w-[7px] h-[7px] rounded-full bg-[var(--accent)]" />{" "}
            Volume recebido
          </div>
          <div className="flex items-end justify-between gap-[10px]">
            <div className="shrink-0">
              <div className="font-display font-semibold text-[27px] leading-none">
                {volume?.avgPerDay ?? 0}
                <small className="text-[13px] text-[var(--muted)] ml-1">
                  /dia
                </small>
              </div>
              <div
                className={`text-[11px] mt-[7px] inline-flex items-center gap-[3px] font-medium ${up ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}
              >
                {up ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {up ? "+" : ""}
                {volume?.pctChange ?? 0}% vs anterior
              </div>
            </div>
            <div className="flex-1 min-w-0 max-w-[150px] overflow-hidden">
              <Sparkline data={volume?.sparkline ?? []} />
              <div className="text-[10px] text-[var(--muted-2)] text-right mt-[2px]">
                últimos 30 dias
              </div>
            </div>
          </div>
        </div>

        <div
          className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px]"
          title={`Tempo medido só em horário comercial (${String(
            responseTime?.work_window?.start_hour ?? 8,
          ).padStart(2, "0")}h–${String(
            responseTime?.work_window?.end_hour ?? 20,
          ).padStart(2, "0")}h, seg–sex). Pausas noturnas e de fim de semana não contam, então a média reflete o tempo útil de resposta.`}
        >
          <div className="text-[11.5px] text-[var(--muted)] mb-[9px] flex items-center gap-[6px]">
            <Timer className="w-3.5 h-3.5 text-[var(--info)]" /> Tempo médio de
            resposta
          </div>
          <div className="font-display font-semibold text-[27px] leading-none">
            {formatMinutes(responseTime?.avg_minutes ?? null)}
          </div>
          <div className="text-[11px] text-[var(--muted-2)] mt-[7px]">
            mediana {formatMinutes(responseTime?.median_minutes ?? null)} ·{" "}
            {responseTime?.sample ?? 0} respostas
          </div>
          <div className="text-[10.5px] text-[var(--muted-2)] mt-[4px]">
            em horário comercial ·{" "}
            {String(responseTime?.work_window?.start_hour ?? 8).padStart(2, "0")}
            h–
            {String(responseTime?.work_window?.end_hour ?? 20).padStart(2, "0")}h
            seg–sex
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px]">
          <div className="text-[11.5px] text-[var(--muted)] mb-[9px] flex items-center gap-[6px]">
            <Mic className="w-3.5 h-3.5 text-[var(--warn)]" /> Convites em aberto
          </div>
          <div className="font-display font-semibold text-[27px] leading-none">
            {openReceived.length}
          </div>
          <div className="text-[11px] text-[var(--muted-2)] mt-[7px]">
            {received.length} recebidos · {sent.length} feitos por mim
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[16px]">
          <div className="text-[11.5px] text-[var(--muted)] mb-[9px] flex items-center gap-[6px]">
            <ListChecks className="w-3.5 h-3.5 text-[var(--accent)]" /> Pendências
            de mim
          </div>
          <div className="font-display font-semibold text-[27px] leading-none">
            {minePending}
          </div>
          <div className="text-[11px] text-[var(--muted-2)] mt-[7px]">
            tarefas minhas em aberto
          </div>
        </div>
      </div>

      {/* Intelligence (cloud + list) + Tag distribution */}
      <div className="grid grid-cols-[1.5fr_1fr] gap-[16px]">
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
              O que falam comigo — temas &amp; quem gera
            </h3>
            <span className="inline-flex items-center gap-[5px] text-[11px] text-[var(--muted-2)] border border-[var(--border)] px-[8px] py-[2px] rounded-[20px] font-mono">
              <Lightbulb className="w-3 h-3" /> clique para ver exemplos
            </span>
          </div>

          {/* Word cloud — size reflects frequency */}
          {intel.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px] pb-[18px] mb-[16px] border-b border-[var(--border-soft)] leading-tight">
              {intel.map((item, i) => {
                const color = PALETTE[i % PALETTE.length];
                const size = 12 + Math.sqrt(item.count / maxIntel) * 17;
                const opacity = 0.55 + (item.count / maxIntel) * 0.45;
                return (
                  <button
                    key={item.topic}
                    onClick={() => setSelectedTopic(item.topic)}
                    title={`${item.count} menç${item.count > 1 ? "ões" : "ão"}`}
                    className="font-display font-semibold cursor-pointer transition-[0.14s] hover:brightness-125 bg-transparent border-none p-0"
                    style={{
                      fontSize: `${size.toFixed(1)}px`,
                      color,
                      opacity,
                    }}
                  >
                    {item.topic}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-[var(--muted-2)] text-[13px]">
              Nenhuma pauta detectada no período.
            </div>
          )}

          {/* Detailed ranked list */}
          <div className="flex flex-col">
            {topIntel.map((item, i) => {
              const color = PALETTE[i % PALETTE.length];
              const delta = item.count - item.prev_count;
              return (
                <div
                  key={item.topic}
                  onClick={() => setSelectedTopic(item.topic)}
                  className="flex items-start gap-[13px] py-[13px] border-b border-[var(--border-soft)] last:border-none cursor-pointer hover:bg-[var(--surface-2)] -mx-[8px] px-[8px] rounded-[8px] transition-[0.12s]"
                >
                  <span className="font-mono text-[12px] text-[var(--muted-2)] w-[18px] pt-[3px]">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium leading-[1.4]">
                      {item.topic}
                    </div>
                    <div className="mt-[7px] mb-[8px] h-[7px] bg-[var(--surface-3)] rounded-[7px] overflow-hidden">
                      <span
                        className="block h-full rounded-[7px]"
                        style={{
                          width: `${Math.round((item.count / maxIntel) * 100)}%`,
                          background: `linear-gradient(90deg, ${color}66, ${color})`,
                          boxShadow: `0 0 8px ${color}55`,
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-[8px] flex-wrap">
                      <span className="text-[11px] text-[var(--muted-2)] font-mono inline-flex items-center gap-[4px]">
                        <Users className="w-3 h-3" /> {item.person_count}
                      </span>
                      {item.people.slice(0, 3).map(
                        (p, pi) =>
                          p.name && (
                            <span
                              key={pi}
                              className="text-[11px] px-[7px] py-[1px] rounded-[6px] bg-[var(--surface-2)] text-[var(--muted)] truncate max-w-[120px]"
                            >
                              {p.name}
                            </span>
                          ),
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-[8px] shrink-0">
                    <span className="inline-flex items-center gap-[5px]">
                      <span
                        className={`inline-flex items-center gap-[2px] text-[11px] font-mono ${
                          delta > 0
                            ? "text-[var(--ok)]"
                            : delta < 0
                              ? "text-[var(--danger)]"
                              : "text-[var(--muted-2)]"
                        }`}
                        title="vs período anterior"
                      >
                        {delta > 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : delta < 0 ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {delta > 0 ? `+${delta}` : delta}
                      </span>
                      <span
                        className="font-mono text-[12px] font-semibold"
                        style={{ color }}
                      >
                        {item.count}
                      </span>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveTopic(item.topic);
                      }}
                      className="text-[11px] font-sans font-semibold text-[var(--accent)] bg-[rgba(53,224,216,0.14)] border-none px-[10px] py-[4px] rounded-[7px] cursor-pointer inline-flex items-center gap-[5px] transition-[0.14s] whitespace-nowrap hover:bg-[rgba(53,224,216,0.22)]"
                    >
                      <Bookmark className="w-3 h-3" /> salvar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tag distribution (manual contact tags) */}
        <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
          <div className="flex items-center justify-between mb-[16px]">
            <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
              <Tag className="w-3.5 h-3.5" /> Distribuição por tag
            </h3>
          </div>
          <div className="flex flex-col gap-[2px]">
            {sortedLabels.map((label, i) => {
              const color = label.color || PALETTE[i % PALETTE.length];
              return (
                <div key={label.id} className="flex items-center gap-[12px] py-[9px]">
                  <span className="w-[120px] text-[12.5px] text-[var(--text)] font-medium truncate inline-flex items-center gap-[7px]">
                    <span
                      className="w-[9px] h-[9px] rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {label.name}
                  </span>
                  <span className="flex-1 h-[9px] bg-[var(--surface-3)] rounded-[9px] overflow-hidden">
                    <span
                      className="block h-full rounded-[9px]"
                      style={{
                        width: `${Math.round((label.contact_count / maxLabel) * 100)}%`,
                        background: `linear-gradient(90deg, ${color}66, ${color})`,
                      }}
                    />
                  </span>
                  <span className="font-mono text-[12.5px] text-[var(--muted)] w-[34px] text-right">
                    {label.contact_count}
                  </span>
                </div>
              );
            })}
            {sortedLabels.length === 0 && (
              <div className="py-8 text-center">
                <Tag className="w-6 h-6 text-[var(--muted-2)] mx-auto mb-[10px]" />
                <div className="text-[13px] text-[var(--muted)] mb-[4px]">
                  Nenhuma tag ainda
                </div>
                <div className="text-[12px] text-[var(--muted-2)] mb-[14px] leading-[1.5]">
                  Crie tags como equipe, cliente ou imprensa nos contatos para
                  ver quem é quem.
                </div>
                <button
                  onClick={() => navigate("/contatos")}
                  className="px-[12px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] text-[12px] font-semibold cursor-pointer hover:border-[var(--accent-dim)] hover:text-[var(--accent)] inline-flex items-center gap-[6px]"
                >
                  Gerenciar tags nos contatos{" "}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Convites & oportunidades — recebidos × feitos */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-[16px] gap-[10px] flex-wrap">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
            <Mic className="w-3.5 h-3.5" /> Convites &amp; oportunidades
            <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--muted-2)]">
              em aberto
            </span>
          </h3>
          <div className="flex items-center gap-[8px] flex-wrap">
            <div className="inline-flex items-center bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[8px] p-[2px] gap-[2px]">
              {(
                [
                  ["recebidos", `Recebidos (${openReceived.length})`],
                  ["feitos", `Feitos por mim (${openSent.length})`],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setInviteDir(val)}
                  className={`px-[10px] py-[5px] rounded-[6px] text-[11.5px] font-semibold cursor-pointer transition-[0.14s] ${
                    inviteDir === val
                      ? "bg-[var(--surface-3)] text-[var(--text)]"
                      : "text-[var(--muted-2)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate("/salvos")}
              className="inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-[var(--accent)] bg-[rgba(53,224,216,0.14)] border-none px-[11px] py-[6px] rounded-[8px] cursor-pointer transition-[0.14s] whitespace-nowrap hover:bg-[rgba(53,224,216,0.22)]"
            >
              <Handshake className="w-3.5 h-3.5" /> Triar convites
              {triagedCount > 0 && (
                <span className="font-mono text-[10.5px] text-[var(--muted)]">
                  · {triagedCount} triados
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-[18px]">
          {shownInvites.map((inv) => (
            <InviteOpenRow
              key={inv.phone ?? inv.message_id}
              inv={inv}
              inviteDir={inviteDir}
              onOpen={(item) => {
                const chatId = item.phone ?? "";
                if (!chatId) return;
                if (pending?.some((p) => p.chat_id === chatId)) {
                  setSelectedChatId(chatId);
                  return;
                }
                setInviteThread({ chatId, name: item.name });
              }}
            />
          ))}
          {shownInvites.length === 0 && (
            <div className="py-6 text-center col-span-2">
              <div className="text-[13px] text-[var(--muted-2)]">
                {inviteDir === "recebidos"
                  ? "Nenhum convite recebido em aberto no período."
                  : "Nenhum convite feito por você em aberto no período."}
              </div>
              {triagedCount > 0 && (
                <button
                  onClick={() => navigate("/salvos")}
                  className="mt-[10px] inline-flex items-center gap-[5px] text-[12px] font-semibold text-[var(--accent)] cursor-pointer hover:opacity-80 transition-[0.14s]"
                >
                  Ver {triagedCount} já triado{triagedCount > 1 ? "s" : ""} na
                  triagem <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pendências de contatos */}
      <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
        <div className="flex items-center justify-between mb-[16px]">
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
            <AlertCircle className="w-3.5 h-3.5" /> Pendências de contatos
          </h3>
          <span className="font-mono text-[var(--muted)] text-[12px]">
            {pending?.length || 0} contatos
          </span>
        </div>
        <div className="flex flex-col">
          {pending?.map((p, i) => (
            <div
              key={i}
              onClick={() => setSelectedChatId(p.chat_id)}
              className="flex items-center gap-[12px] py-[11px] px-[8px] rounded-[9px] hover:bg-[var(--surface-2)] cursor-pointer transition-[0.14s]"
            >
              <div
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-semibold shrink-0 text-[#0A0A0C]"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              >
                {p.name?.substring(0, 2)?.toUpperCase() || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold truncate text-[var(--text)]">
                  {p.name || p.chat_id}
                </div>
                <div className="text-[11.5px] text-[var(--muted)] truncate mt-[2px]">
                  {p.last_text || p.reason}
                </div>
              </div>
              <div className="flex items-center gap-[8px] shrink-0">
                {p.unanswered && (
                  <span className="text-[11px] px-[9px] py-[2px] rounded-full font-medium whitespace-nowrap bg-[rgba(248,113,113,0.13)] text-[var(--danger)]">
                    não respondida
                  </span>
                )}
                {p.open_tasks > 0 && (
                  <span className="text-[11px] px-[9px] py-[2px] rounded-full font-medium whitespace-nowrap bg-[rgba(53,224,216,0.14)] text-[var(--accent)]">
                    {p.open_tasks} tarefa{p.open_tasks > 1 ? "s" : ""}
                  </span>
                )}
                {p.last_at && (
                  <span
                    className={`font-mono text-[11.5px] text-right whitespace-nowrap ${
                      p.last_at &&
                      Date.now() - new Date(p.last_at).getTime() >
                        48 * 3600 * 1000
                        ? "text-[var(--danger)]"
                        : "text-[var(--muted-2)]"
                    }`}
                  >
                    {timeAgo(p.last_at)}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-[var(--muted-2)]" />
              </div>
            </div>
          ))}
          {pending?.length === 0 && (
            <div className="py-6 text-center text-[var(--muted-2)] text-[13px]">
              Nenhuma pendência no período.
            </div>
          )}
        </div>
      </div>

      <PendingDrawer
        contact={selected}
        onClose={() => setSelectedChatId(null)}
      />
      <InviteThreadSheet
        chatId={inviteThread?.chatId ?? null}
        name={inviteThread?.name ?? null}
        onClose={() => setInviteThread(null)}
      />
      <TopicDrawer
        topic={selectedTopic}
        days={days}
        onClose={() => setSelectedTopic(null)}
        onSave={saveTopic}
      />
    </div>
  );
}
