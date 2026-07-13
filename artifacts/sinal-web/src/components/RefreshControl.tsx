import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, Zap } from "lucide-react";
import {
  useRefreshStatus,
  useRefreshLive,
  useStartRefresh,
  useStartQuickRefresh,
  ApiError,
} from "@/lib/api";
import { useNotifications } from "@/hooks/use-notifications";
import { useToast } from "@/hooks/use-toast";

const DATA_PREFIXES = [
  ["metrics"],
  ["contacts"],
  ["topics"],
  ["groups"],
  ["mentions"],
  ["entities"],
  ["saved"],
  ["tasks"],
  ["media"],
] as const;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "agora";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function lastUpdatedLabel(iso: string | null): string {
  if (!iso) return "sem registro";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RefreshControl() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { push } = useNotifications();
  const { data } = useRefreshStatus();
  const { data: live } = useRefreshLive();
  const start = useStartRefresh();
  const quick = useStartQuickRefresh();

  const run = data?.run ?? null;
  const isRunning = run?.status === "running" || live?.refreshRunning;
  const busy = isRunning || start.isPending || quick.isPending;

  const prevStatus = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevStatus.current;
    const curr = run?.status ?? null;
    if (prev === "running" && curr && curr !== "running") {
      if (curr === "completed") {
        for (const key of DATA_PREFIXES)
          qc.invalidateQueries({ queryKey: key });
      } else if (curr === "failed") {
        for (const key of DATA_PREFIXES)
          qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["refresh", "live"] });
    }
    prevStatus.current = curr;
  }, [run?.status, qc]);

  function onRefreshError(err: unknown) {
    if (err instanceof ApiError && err.status === 409) return;
    const message =
      err instanceof Error ? err.message : "Tente novamente em instantes.";
    toast({
      variant: "destructive",
      title: "Não foi possível iniciar",
      description: message,
    });
    push({
      kind: "refresh_fail",
      title: "Não foi possível iniciar refresh",
      body: message,
      dedupeKey: String(Date.now()),
      toast: false,
    });
  }

  const lastDone = run && run.status !== "running" ? run.finishedAt : null;
  const pending = live?.pendingUnanswered ?? 0;
  const unenriched = live?.unenrichedRecent ?? 0;

  return (
    <div className="flex items-center gap-[10px]">
      <span className="text-[11px] text-[var(--muted-2)] hidden lg:inline leading-snug">
        {isRunning ? (
          "Atualizando dados…"
        ) : start.isError && !(start.error instanceof ApiError) ? (
          <span className="inline-flex items-center gap-[4px] text-[var(--danger)]">
            <AlertTriangle className="w-3 h-3" /> erro ao atualizar
          </span>
        ) : (
          <>
            Msg {formatRelative(live?.lastMessageAt ?? null)}
            {" · "}
            Refresh {formatRelative(live?.lastRefreshAt ?? lastDone)}
            {pending > 0 ? ` · ${pending} pendente(s)` : null}
            {unenriched > 0 ? ` · ${unenriched} nova(s)` : null}
          </>
        )}
      </span>
      <button
        type="button"
        onClick={() => {
          if (busy) return;
          quick.mutate(undefined, { onError: onRefreshError });
        }}
        disabled={busy}
        title="Atualização rápida (classifica mensagens novas, tasks e menções — sem rebuild de pautas)"
        className="hidden sm:flex items-center gap-[6px] bg-transparent border border-[var(--border)] p-[7px_10px] rounded-[var(--radius-sm)] text-[12px] text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)] transition-colors outline-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        <Zap className={`w-[13px] h-[13px] ${quick.isPending ? "text-[var(--accent)]" : ""}`} />
        Rápido
      </button>
      <button
        type="button"
        onClick={() => {
          if (busy) return;
          start.mutate(undefined, { onError: onRefreshError });
        }}
        disabled={busy}
        title="Atualização completa (inclui rebuild de pautas/tópicos)"
        className="flex items-center gap-[7px] bg-[var(--surface-2)] border border-[var(--border)] p-[7px_12px] rounded-[var(--radius-sm)] text-[12.5px] text-[var(--muted)] hover:border-[var(--accent-dim)] hover:text-[var(--text)] transition-colors outline-none disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
      >
        <RefreshCw
          className={`w-[14px] h-[14px] ${busy ? "animate-spin text-[var(--accent)]" : ""}`}
        />
        {busy ? "Atualizando…" : "Completo"}
      </button>
      <span className="text-[10px] text-[var(--muted-2)] hidden xl:inline">
        {lastUpdatedLabel(lastDone)}
      </span>
    </div>
  );
}
