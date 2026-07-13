import { useState } from "react";
import {
  useTasks,
  useSaved,
  useUpdateTask,
  useCreateTask,
  useDeleteTask,
  useClearCompletedTasks,
  useTopics,
  useUnanswered,
  useGroupUnanswered,
  useInvites,
  useUpdateInviteStatus,
  useInviteToTask,
  type InviteItem,
  type InviteStatus,
  type Task,
} from "@/lib/api";
import {
  Loader2,
  Lightbulb,
  Bookmark,
  HelpCircle,
  Check,
  Mic,
  Handshake,
  Send,
  CornerDownLeft,
  Circle,
  CheckCircle2,
  XCircle,
  ListPlus,
  GripVertical,
  CalendarClock,
  Plus,
  X,
  Trash2,
} from "lucide-react";

const INVITE_WINDOW = 180;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mes`;
  return `${Math.floor(months / 12)}a`;
}

type DueTone = "overdue" | "today" | "soon" | "later";

// Whole-day difference between a due date and today (negative = overdue, 0 =
// today). Shared by the relative due indicator and the urgency sort so both
// always agree.
function dueDiffDays(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(due) - startOfDay(new Date())) / dayMs);
}

function dueIndicator(
  iso: string | null,
  done?: boolean,
): { label: string; tone: DueTone } | null {
  const diffDays = dueDiffDays(iso);
  if (diffDays === null) return null;

  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return {
      label: done ? `venceu há ${n}d` : `atrasada ${n}d`,
      tone: done ? "later" : "overdue",
    };
  }
  if (diffDays === 0) return { label: "Hoje", tone: "today" };
  if (diffDays === 1) return { label: "Amanhã", tone: "soon" };
  if (diffDays <= 3) return { label: `em ${diffDays}d`, tone: "soon" };
  return { label: `em ${diffDays}d`, tone: "later" };
}

const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "bg-[rgba(248,113,113,0.13)] text-[var(--danger)]",
  today: "bg-[rgba(245,158,11,0.14)] text-[var(--warn)]",
  soon: "bg-[rgba(53,224,216,0.12)] text-[var(--accent)]",
  later: "bg-[var(--surface-3)] text-[var(--muted-2)]",
};

const COLUMNS: {
  status: InviteStatus;
  label: string;
  icon: typeof Circle;
  tint: string;
}[] = [
  { status: "aberto", label: "Em aberto", icon: Circle, tint: "var(--warn)" },
  {
    status: "resolvido",
    label: "Resolvidos",
    icon: CheckCircle2,
    tint: "var(--ok)",
  },
  { status: "ignorado", label: "Ignorados", icon: XCircle, tint: "var(--muted-2)" },
];

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const QUICK_PRAZOS: { label: string; days: number }[] = [
  { label: "Hoje", days: 0 },
  { label: "Amanhã", days: 1 },
  { label: "Próxima semana", days: 7 },
];

function defaultTitle(inv: InviteItem): string {
  const who = inv.name || inv.phone || "contato";
  return inv.direction === "outbound"
    ? `Acompanhar convite enviado para ${who}`
    : `Responder convite de ${who}`;
}

function InviteCard({
  inv,
  onConvert,
  onDragStart,
  converting,
}: {
  inv: InviteItem;
  onConvert: (inv: InviteItem, title: string, dueAt: string | null) => void;
  onDragStart: (inv: InviteItem) => void;
  converting: boolean;
}) {
  const isSent = inv.direction === "outbound";
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(() => defaultTitle(inv));
  const [due, setDue] = useState("");

  function submit() {
    const t = title.trim();
    if (!t) return;
    const dueAt = due ? new Date(`${due}T12:00:00`).toISOString() : null;
    onConvert(inv, t, dueAt);
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(inv)}
      className="group bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[12px] cursor-grab active:cursor-grabbing hover:border-[var(--border)] transition-[0.14s]"
    >
      <div className="flex items-start gap-[9px]">
        <div className="w-[28px] h-[28px] rounded-[8px] flex items-center justify-center bg-[var(--surface-3)] text-[var(--accent)] shrink-0">
          {isSent ? (
            <Send className="w-3.5 h-3.5" />
          ) : inv.category === "convite" ? (
            <Mic className="w-3.5 h-3.5" />
          ) : (
            <Handshake className="w-3.5 h-3.5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13px] truncate flex items-center gap-[5px]">
            {inv.name || inv.phone}
            <GripVertical className="w-3.5 h-3.5 text-[var(--muted-2)] opacity-0 group-hover:opacity-100 transition-[0.14s] ml-auto shrink-0" />
          </div>
          <div className="flex items-center gap-[6px] mt-[3px] flex-wrap">
            <span
              className={`text-[10px] font-mono px-[6px] py-[1px] rounded-[5px] inline-flex items-center gap-[3px] ${
                isSent
                  ? "bg-[rgba(96,165,250,0.13)] text-[var(--info)]"
                  : "bg-[rgba(53,224,216,0.12)] text-[var(--accent)]"
              }`}
            >
              {isSent ? (
                <>
                  <Send className="w-2.5 h-2.5" /> enviado para
                </>
              ) : (
                <>
                  <CornerDownLeft className="w-2.5 h-2.5" /> recebido de
                </>
              )}
            </span>
            <span className="text-[10px] text-[var(--muted-2)]">
              {inv.category}
            </span>
            {inv.message_count > 1 && (
              <span className="text-[10px] text-[var(--muted-2)] font-mono">
                · {inv.message_count} msgs
              </span>
            )}
          </div>
          {(inv.summary || inv.text) && (
            <div className="text-[11.5px] text-[var(--muted)] mt-[6px] line-clamp-2">
              {inv.summary || inv.text}
            </div>
          )}
          <div className="flex items-center justify-between mt-[8px]">
            <span className="font-mono text-[10px] text-[var(--muted-2)]">
              {timeAgo(inv.at)}
            </span>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                disabled={converting}
                className="inline-flex items-center gap-[4px] text-[10.5px] font-medium text-[var(--accent)] bg-[var(--surface-3)] hover:bg-[var(--surface)] border border-[var(--border-soft)] rounded-[6px] px-[8px] py-[3px] cursor-pointer transition-[0.14s] disabled:opacity-50"
              >
                <ListPlus className="w-3 h-3" /> Virar tarefa
              </button>
            )}
          </div>
          {editing && (
            <div
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              className="mt-[10px] pt-[10px] border-t border-[var(--border-soft)] flex flex-col gap-[8px]"
            >
              <label className="text-[10px] font-medium text-[var(--muted-2)] uppercase tracking-[0.02em]">
                Título da tarefa
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") setEditing(false);
                }}
                autoFocus
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
              />
              <label className="text-[10px] font-medium text-[var(--muted-2)] uppercase tracking-[0.02em] flex items-center gap-[5px]">
                <CalendarClock className="w-3 h-3" /> Prazo (opcional)
              </label>
              <div className="flex items-center gap-[6px] flex-wrap">
                {QUICK_PRAZOS.map((q) => {
                  const d = new Date();
                  d.setDate(d.getDate() + q.days);
                  const val = toDateInputValue(d);
                  const active = due === val;
                  return (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setDue(active ? "" : val)}
                      className={`text-[10.5px] font-medium rounded-[6px] px-[8px] py-[3px] cursor-pointer transition-[0.14s] border ${
                        active
                          ? "bg-[var(--accent)] text-[#06201e] border-[var(--accent)]"
                          : "bg-[var(--surface-3)] text-[var(--muted)] border-[var(--border-soft)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                      }`}
                    >
                      {q.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-[6px] px-[9px] py-[6px] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
              />
              <div className="flex items-center gap-[8px] mt-[2px]">
                <button
                  onClick={submit}
                  disabled={converting || !title.trim()}
                  className="inline-flex items-center gap-[4px] text-[11px] font-medium text-[#06201e] bg-[var(--accent)] hover:opacity-90 rounded-[6px] px-[10px] py-[5px] cursor-pointer transition-[0.14s] disabled:opacity-50"
                >
                  {converting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ListPlus className="w-3 h-3" />
                  )}
                  Criar tarefa
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={converting}
                  className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)] rounded-[6px] px-[8px] py-[5px] cursor-pointer transition-[0.14s] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InvitesKanban() {
  const { data: invites, isLoading } = useInvites(INVITE_WINDOW);
  const updateStatus = useUpdateInviteStatus();
  const toTask = useInviteToTask();
  const [dragging, setDragging] = useState<InviteItem | null>(null);
  const [overCol, setOverCol] = useState<InviteStatus | null>(null);

  function moveTo(status: InviteStatus) {
    if (!dragging || dragging.status === status) {
      setDragging(null);
      setOverCol(null);
      return;
    }
    updateStatus.mutate({
      chatId: dragging.phone ?? "",
      status,
      sourceMessageId: dragging.message_id,
      direction: dragging.direction,
      name: dragging.name,
      contactId: dragging.contact_id,
    });
    setDragging(null);
    setOverCol(null);
  }

  function convert(inv: InviteItem, title: string, dueAt: string | null) {
    toTask.mutate({
      chatId: inv.phone ?? "",
      title,
      direction: inv.direction === "outbound" ? "theirs" : "mine",
      sourceMessageId: inv.message_id,
      contactId: inv.contact_id,
      name: inv.name,
      inviteDirection: inv.direction,
      dueAt,
    });
  }

  const byStatus = (s: InviteStatus) =>
    (invites ?? []).filter((i) => i.status === s);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
      <div className="flex items-center justify-between mb-[16px] flex-wrap gap-[8px]">
        <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] flex items-center gap-[7px]">
          <Handshake className="w-3.5 h-3.5" /> Triagem de convites
        </h3>
        <span className="text-[11px] text-[var(--muted-2)]">
          Arraste entre as colunas · últimos {INVITE_WINDOW} dias
        </span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-[14px]">
          {COLUMNS.map((col) => {
            const items = byStatus(col.status);
            const Icon = col.icon;
            return (
              <div
                key={col.status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(col.status);
                }}
                onDragLeave={() => setOverCol((c) => (c === col.status ? null : c))}
                onDrop={() => moveTo(col.status)}
                className={`flex flex-col gap-[10px] rounded-[10px] p-[10px] min-h-[140px] transition-[0.14s] ${
                  overCol === col.status
                    ? "bg-[var(--surface-2)] outline outline-1 outline-[var(--accent-dim)]"
                    : "bg-[var(--surface-2)]/40"
                }`}
              >
                <div className="flex items-center justify-between px-[2px]">
                  <div
                    className="text-[11.5px] font-semibold uppercase tracking-[0.02em] flex items-center gap-[6px]"
                    style={{ color: col.tint }}
                  >
                    <Icon className="w-3.5 h-3.5" /> {col.label}
                  </div>
                  <span className="font-mono text-[11px] text-[var(--muted-2)]">
                    {items.length}
                  </span>
                </div>
                {items.map((inv) => (
                  <InviteCard
                    key={inv.phone ?? inv.message_id}
                    inv={inv}
                    onConvert={convert}
                    onDragStart={setDragging}
                    converting={toTask.isPending}
                  />
                ))}
                {items.length === 0 && (
                  <div className="py-6 text-center text-[var(--muted-2)] text-[12px]">
                    Vazio
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskDueEditor({ task }: { task: Task }) {
  const updateTask = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState(() =>
    task.due_at ? toDateInputValue(new Date(task.due_at)) : "",
  );

  function save(value: string) {
    const dueAt = value ? new Date(`${value}T12:00:00`).toISOString() : null;
    updateTask.mutate(
      { id: task.id, data: { dueAt } },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (!editing) {
    const ind = dueIndicator(task.due_at, task.done);
    return (
      <button
        onClick={() => {
          setDue(task.due_at ? toDateInputValue(new Date(task.due_at)) : "");
          setEditing(true);
        }}
        className="inline-flex items-center gap-[5px] cursor-pointer hover:opacity-80 transition-[0.14s]"
      >
        {task.due_at ? (
          <>
            <span className="text-[var(--muted-2)]">
              Prazo: {new Date(task.due_at).toLocaleDateString("pt-BR")}
            </span>
            {ind && (
              <span
                className={`inline-flex items-center gap-[3px] px-[6px] py-[1px] rounded-[5px] font-medium ${DUE_TONE_CLASS[ind.tone]}`}
              >
                <CalendarClock className="w-2.5 h-2.5" /> {ind.label}
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-[3px] text-[var(--muted-2)] hover:text-[var(--accent)]">
            <Plus className="w-2.5 h-2.5" /> Definir prazo
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[7px] w-full mt-[2px]">
      <div className="flex items-center gap-[6px] flex-wrap">
        {QUICK_PRAZOS.map((q) => {
          const d = new Date();
          d.setDate(d.getDate() + q.days);
          const val = toDateInputValue(d);
          const active = due === val;
          return (
            <button
              key={q.label}
              type="button"
              disabled={updateTask.isPending}
              onClick={() => {
                setDue(val);
                save(val);
              }}
              className={`text-[10.5px] font-medium rounded-[6px] px-[8px] py-[3px] cursor-pointer transition-[0.14s] border disabled:opacity-50 ${
                active
                  ? "bg-[var(--accent)] text-[#06201e] border-[var(--accent)]"
                  : "bg-[var(--surface-3)] text-[var(--muted)] border-[var(--border-soft)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              }`}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-[6px] flex-wrap">
        <input
          type="date"
          value={due}
          disabled={updateTask.isPending}
          onChange={(e) => {
            setDue(e.target.value);
            save(e.target.value);
          }}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-[6px] px-[8px] py-[4px] text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)] disabled:opacity-50"
        />
        {task.due_at && (
          <button
            type="button"
            disabled={updateTask.isPending}
            onClick={() => save("")}
            className="inline-flex items-center gap-[3px] text-[10.5px] font-medium text-[var(--danger)] bg-[var(--surface-3)] border border-[var(--border-soft)] rounded-[6px] px-[8px] py-[4px] cursor-pointer hover:bg-[var(--surface)] transition-[0.14s] disabled:opacity-50"
          >
            <X className="w-2.5 h-2.5" /> Limpar
          </button>
        )}
        <button
          type="button"
          disabled={updateTask.isPending}
          onClick={() => setEditing(false)}
          className="inline-flex items-center gap-[3px] text-[10.5px] font-medium text-[var(--muted)] hover:text-[var(--text)] rounded-[6px] px-[6px] py-[4px] cursor-pointer transition-[0.14s] disabled:opacity-50"
        >
          {updateTask.isPending ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            "Cancelar"
          )}
        </button>
      </div>
    </div>
  );
}

export default function Salvos() {
  const { data: tasks, isLoading: loadingT } = useTasks();
  const { data: saved, isLoading: loadingS } = useSaved();
  const { data: topics, isLoading: loadingTopics } = useTopics({ scope: "group", crossgroup: true });
  const { data: unanswered, isLoading: loadingUa } = useGroupUnanswered(10);
  
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();
  const clearCompleted = useClearCompletedTasks();
  const [newTask, setNewTask] = useState("");
  const completedCount = tasks?.filter((t) => t.done).length ?? 0;

  // Order by urgency: open tasks first (overdue, then today, then soonest),
  // tasks with no deadline after dated ones, and completed tasks at the bottom.
  // Array#sort is stable, so equal-urgency tasks keep their original order.
  const NO_DEADLINE_KEY = 1e9;
  const DONE_KEY = Number.MAX_SAFE_INTEGER;
  const taskSortKey = (t: Task): number => {
    if (t.done) return DONE_KEY;
    const diff = dueDiffDays(t.due_at);
    return diff === null ? NO_DEADLINE_KEY : diff;
  };
  const sortedTasks = [...(tasks ?? [])].sort(
    (a, b) => taskSortKey(a) - taskSortKey(b),
  );

  function submitNewTask() {
    const title = newTask.trim();
    if (!title || createTask.isPending) return;
    createTask.mutate(
      { title },
      { onSuccess: () => setNewTask("") },
    );
  }

  if (loadingT || loadingS || loadingTopics || loadingUa) {
    return <div className="flex items-center justify-center h-[calc(100vh-200px)]"><Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" /></div>;
  }

  return (
    <div className="flex flex-col gap-[16px] animate-in fade-in slide-in-from-bottom-2 duration-400">
      
      <div className="inline-flex bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] p-[3px] gap-[2px] self-start mb-[8px]">
        <button className="bg-[var(--surface-3)] text-[var(--text)] border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s]">Todos</button>
        <button className="bg-transparent text-[var(--muted)] border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s] hover:text-[var(--text)]">Mensagens</button>
        <button className="bg-transparent text-[var(--muted)] border-none font-inherit text-[12px] font-medium px-[11px] py-[4px] rounded-[6px] cursor-pointer transition-[0.14s] hover:text-[var(--text)]">Trechos / Pautas</button>
      </div>

      {/* Triagem de convites (Kanban) */}
      <InvitesKanban />

      <div className="grid grid-cols-[1.2fr_1fr] gap-[20px]">
        <div className="flex flex-col gap-[20px]">
          {/* Central de Salvos */}
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Itens Salvos (Central)</h3>
            </div>
            <div className="flex flex-col">
              {saved?.map((item) => (
                <div key={item.id} className="flex items-start gap-[12px] py-[13px] border-b border-[var(--border-soft)] last:border-none cursor-pointer hover:bg-[var(--surface-2)] -mx-2 px-2 rounded-[8px]">
                  <div className="shrink-0 pt-[1px] text-[var(--accent)]">{item.kind === 'pauta' ? <Lightbulb className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}</div>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-medium leading-[1.4] text-[var(--text)]">“{item.text}”</div>
                    <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[4px] flex gap-[9px] items-center">
                      <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px] capitalize">{item.kind}</span>
                      <span>{item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!saved?.length && (
                <div className="py-6 text-center text-[var(--muted-2)] text-[13px]">Nenhum item salvo.</div>
              )}
            </div>
          </div>

          {/* Perguntas Sem Resposta (derived from Unanswered) */}
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Perguntas sem Resposta (Grupos)</h3>
              <span className="font-mono text-[var(--muted)] text-[12px]">{unanswered?.length || 0} pendentes</span>
            </div>
            <div className="flex flex-col">
              {unanswered?.slice(0,4).map((item, i) => (
                <div key={i} className="flex items-start gap-[12px] py-[12px] border-b border-[var(--border-soft)] last:border-none">
                  <div className="text-[var(--warn)] shrink-0 pt-[1px]"><HelpCircle className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <div className="text-[13.5px] font-medium leading-[1.4]">“{item.text || item.summary}”</div>
                    <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[4px] flex gap-[9px] items-center">
                      <span className="bg-[var(--surface-3)] text-[var(--muted)] px-[7px] py-[1px] rounded-[5px]">{item.chat_name || item.name}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!unanswered?.length && (
                <div className="py-4 text-center text-[var(--muted-2)] text-[13px]">Nenhuma pendência em grupos.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[20px]">
          {/* Tasks & Follow-ups */}
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px] gap-[8px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Tasks & Follow-ups</h3>
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (clearCompleted.isPending) return;
                    clearCompleted.mutate();
                  }}
                  disabled={clearCompleted.isPending}
                  className="inline-flex items-center gap-[5px] text-[11px] font-medium text-[var(--muted-2)] bg-[var(--surface-3)] border border-[var(--border-soft)] rounded-[6px] px-[9px] py-[4px] cursor-pointer transition-[0.14s] hover:text-[var(--danger,#f87171)] hover:bg-[var(--surface-2)] disabled:opacity-50 shrink-0"
                >
                  {clearCompleted.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Limpar concluídas ({completedCount})
                </button>
              )}
            </div>
            
            <input 
              type="text" 
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewTask();
              }}
              disabled={createTask.isPending}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] p-[9px_12px] text-[var(--text)] font-inherit text-[13px] outline-none mb-[16px] focus:border-[var(--accent-dim)] disabled:opacity-50"
              placeholder="Adicionar nova task rápida (Enter)" 
            />

            <div className="flex flex-col">
              {sortedTasks.map((task) => (
                <div key={task.id} className={`group flex items-start gap-[11px] py-[11px] border-b border-[var(--border-soft)] last:border-none cursor-pointer hover:bg-[var(--surface-2)] -mx-2 px-2 rounded-[8px] ${task.done ? 'opacity-60' : ''}`}>
                  <div 
                    onClick={() => updateTask.mutate({ id: task.id, data: { done: !task.done } })}
                    className={`w-[19px] h-[19px] border-[1.5px] border-[var(--border)] rounded-[6px] shrink-0 cursor-pointer mt-[1px] flex items-center justify-center transition-[0.15s] text-[12px] text-[#06201e] font-bold leading-none ${task.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'hover:border-[var(--accent)]'}`}
                  >
                    {task.done && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-[13.5px] font-medium leading-[1.4] ${task.done ? 'line-through text-[var(--muted-2)]' : ''}`}>
                      {task.title}
                      {task.direction === 'mine' && <span className="text-[10.5px] font-mono px-[7px] py-[1px] rounded-[5px] ml-[4px] whitespace-nowrap bg-[rgba(53,224,216,0.12)] text-[var(--accent)]">mine</span>}
                      {task.direction === 'theirs' && <span className="text-[10.5px] font-mono px-[7px] py-[1px] rounded-[5px] ml-[4px] whitespace-nowrap bg-[rgba(96,165,250,0.13)] text-[var(--info)]">theirs</span>}
                    </div>
                    {task.note && (
                      <div className="text-[12px] text-[var(--muted-2)] mt-[3px] whitespace-pre-wrap break-words">{task.note}</div>
                    )}
                    <div className="text-[11px] text-[var(--muted-2)] font-mono mt-[4px] flex items-center gap-[8px] flex-wrap">
                      {task.contact_name && <span className="text-[var(--accent)]">@{task.contact_name}</span>}
                      <TaskDueEditor task={task} />
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Excluir task"
                    title="Excluir task"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (deleteTask.isPending) return;
                      deleteTask.mutate(task.id);
                    }}
                    disabled={deleteTask.isPending}
                    className="shrink-0 mt-[1px] p-[3px] rounded-[6px] text-[var(--muted-2)] opacity-0 group-hover:opacity-100 transition-[0.15s] hover:text-[var(--danger,#f87171)] hover:bg-[var(--surface-3)] disabled:opacity-50"
                  >
                    <Trash2 className="w-[15px] h-[15px]" />
                  </button>
                </div>
              ))}
              {!tasks?.length && (
                <div className="py-6 text-center text-[var(--muted-2)] text-[13px]">Nenhuma task.</div>
              )}
            </div>
          </div>

          {/* Pautas Arquivadas */}
          <div className="bg-[var(--surface)] border border-[var(--border-soft)] rounded-[var(--radius)] p-[22px]">
            <div className="flex items-center justify-between mb-[16px]">
              <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">Pautas Arquivadas</h3>
            </div>
            <div className="flex flex-col">
              {topics?.slice(3, 7).map((topic, i) => (
                <div key={i} className="flex items-center justify-between py-[12px] border-b border-[var(--border-soft)] last:border-none">
                  <div className="text-[13px] font-medium">{topic.label}</div>
                  <div className="text-[11px] text-[var(--muted-2)] font-mono">{topic.group_count} grupos</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
