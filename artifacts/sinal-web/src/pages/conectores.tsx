import { ReactNode, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGoogleStatus,
  useGoogleImport,
  useGoogleDisconnect,
  useGoogleCalendarEvents,
  useSaveGoogleCredentials,
  getGoogleConnectUrl,
  type GoogleConnectService,
  type ApiError,
  useEvolutionStatus,
  useCreateEvolutionInstance,
  useEvolutionConnect,
  useEvolutionDisconnect,
  useRegisterEvolutionWebhook,
  fetchEvolutionQrcode,
  getStoredEvolutionInstance,
  setStoredEvolutionInstance,
  type EvolutionStatus,
  qk,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Loader2,
  X,
  Contact,
  CalendarDays,
  MessageCircle,
  Code2,
  Bot,
  ExternalLink,
  ChevronRight,
  Copy,
  RefreshCw,
  AlertTriangle,
  Smartphone,
  Server,
  Link2,
  Database,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

function ConnectorCard({
  icon,
  name,
  description,
  children,
  onDetails,
}: {
  icon: ReactNode;
  name: string;
  description: string;
  children: ReactNode;
  onDetails?: () => void;
}) {
  const info = (
    <>
      <div className="w-[44px] h-[44px] rounded-[11px] flex items-center justify-center bg-[var(--surface-3)] text-[#ECECF1] shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[14px]">{name}</div>
        <div className="text-[12px] text-[var(--muted)] mt-[2px] line-clamp-2">
          {description}
        </div>
        {onDetails && (
          <div className="text-[11px] text-[var(--accent)] mt-[6px] font-medium">
            Ver detalhes da conexão
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-[14px] p-[18px] border border-[var(--border-soft)] rounded-[var(--radius)] bg-[var(--surface)]">
      {onDetails ? (
        <button
          type="button"
          onClick={onDetails}
          className="flex items-center gap-[14px] min-w-0 flex-1 text-left rounded-[10px] -m-1 p-1 hover:bg-[var(--surface-2)] transition-colors cursor-pointer group"
        >
          {info}
          <ChevronRight className="w-4 h-4 text-[var(--muted-2)] shrink-0 group-hover:text-[var(--accent)] transition-colors" />
        </button>
      ) : (
        <div className="flex items-center gap-[14px] min-w-0 flex-1">{info}</div>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-[7px] text-[12.5px] font-medium shrink-0">
        {children}
      </div>
    </div>
  );
}

function Banner({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed top-4 right-4 bg-[var(--surface-2)] border border-[var(--border)] px-4 py-2 rounded shadow-lg text-sm text-[var(--text)] z-50 flex items-center gap-2">
      {message}
      <button
        onClick={onClose}
        className="text-[var(--muted)] ml-2 hover:text-[var(--text)] inline-flex items-center"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function useGoogleOAuthBanner() {
  const qc = useQueryClient();
  const { data: status } = useGoogleStatus();
  const [banner, setBanner] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data as { source?: string; status?: string } | null;
      if (!d || d.source !== "sinal-google") return;
      setConnecting(false);
      if (d.status === "connected") {
        setBanner("Google conectado com sucesso.");
        void qc.invalidateQueries({ queryKey: qk.googleStatus });
        void qc.invalidateQueries({ queryKey: ["google", "calendar"] });
      } else if (d.status === "denied") {
        setBanner("Conexão com o Google cancelada.");
      } else {
        setBanner("Falha ao conectar com o Google. Tente novamente.");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [qc]);

  // OAuth popup closed without callback — stop spinner when status updates or timeout.
  useEffect(() => {
    if (!connecting) return;
    if (status?.contacts || status?.calendar) {
      setConnecting(false);
      return;
    }
    const poll = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: qk.googleStatus });
    }, 3000);
    const timeout = window.setTimeout(() => setConnecting(false), 120_000);
    const onFocus = () => {
      void qc.invalidateQueries({ queryKey: qk.googleStatus });
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      window.removeEventListener("focus", onFocus);
    };
  }, [connecting, status?.contacts, status?.calendar, qc]);

  async function connect(service: GoogleConnectService) {
    setConnecting(true);
    const tab = window.open("", "_blank");
    try {
      const { url } = await getGoogleConnectUrl(service);
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch {
      if (tab) tab.close();
      setConnecting(false);
      setBanner(
        "Não foi possível iniciar a conexão. Configure Client ID e Secret em Conectores → Como configurar.",
      );
    }
  }

  return { banner, setBanner, connecting, connect };
}

function GoogleStatusDot({ active }: { active: boolean }) {
  return active ? (
    <span className="text-[var(--ok)] flex items-center gap-1.5 mr-2">
      <span className="w-[8px] h-[8px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]" />
      Ativo
    </span>
  ) : (
    <span className="text-[var(--muted-2)] flex items-center gap-1.5 mr-2">
      <span className="w-[8px] h-[8px] rounded-full bg-[var(--muted-2)]" />
      Inativo
    </span>
  );
}

function GoogleSetupDialog({
  open,
  onOpenChange,
  redirectUri,
  clientIdMasked,
  storedInDb,
  envFilePath,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectUri: string | null;
  clientIdMasked: string | null;
  storedInDb: boolean;
  envFilePath: string | null;
  onSaved?: () => void;
}) {
  const save = useSaveGoogleCredentials();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const callback =
    redirectUri ?? "https://SEU-TUNEL.ngrok-free.dev/api/google/callback";

  useEffect(() => {
    if (!open) {
      setClientId("");
      setClientSecret("");
      setMsg(null);
    }
  }, [open]);

  async function handleSave() {
    setMsg(null);
    if (!clientId.trim() || !clientSecret.trim()) {
      setMsg("Informe Client ID e Client Secret.");
      return;
    }
    try {
      const result = await save.mutateAsync({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setClientId("");
      setClientSecret("");
      setMsg(
        result.envUpdated
          ? `Credenciais salvas e .env atualizado (${result.envFilePath ?? envFilePath ?? ".env"}).`
          : "Credenciais salvas no banco.",
      );
      onSaved?.();
    } catch (e) {
      const err = e as ApiError;
      const code =
        err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "";
      if (code === "session_secret_required") {
        setMsg("Defina SESSION_SECRET no .env antes de salvar.");
      } else if (code === "env_write_failed") {
        setMsg("Salvas no banco, mas falhou ao escrever o .env.");
      } else if (code === "invalid_client_id" || code === "invalid_client_secret") {
        setMsg("Client ID ou Secret inválidos.");
      } else {
        setMsg("Erro ao salvar credenciais.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-[var(--surface)] border-[var(--border)] text-[var(--text)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Google OAuth</DialogTitle>
          <DialogDescription className="text-[var(--muted)]">
            Cole as credenciais do Google Cloud aqui. O Sinal criptografa o secret
            no banco e espelha no <code className="text-[12px]">.env</code> — não
            precisa editar o arquivo manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-[12px] mb-1">
          {clientIdMasked ? (
            <span className="text-emerald-400 font-mono">Ativo: {clientIdMasked}</span>
          ) : (
            <span className="text-amber-400">Nenhuma credencial detectada</span>
          )}
          {storedInDb ? (
            <span className="text-[var(--muted)]">· banco ✓</span>
          ) : (
            <span className="text-amber-400">· banco ✗</span>
          )}
        </div>

        <ol className="text-[13px] text-[var(--text)] space-y-[10px] list-decimal list-inside leading-relaxed">
          <li>
            Abra{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Google Cloud Console → APIs e serviços → Credenciais
            </a>
            .
          </li>
          <li>
            Se ainda não tiver projeto, crie um em{" "}
            <a
              href="https://console.cloud.google.com/projectcreate"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Novo projeto
            </a>
            .
          </li>
          <li>
            Ative as APIs:{" "}
            <a
              href="https://console.cloud.google.com/apis/library/people.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              People API
            </a>{" "}
            e{" "}
            <a
              href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              Google Calendar API
            </a>
            .
          </li>
          <li>
            Em Credenciais → <strong>Criar credenciais</strong> →{" "}
            <strong>ID do cliente OAuth</strong> → tipo{" "}
            <strong>Aplicativo da Web</strong>.
          </li>
          <li>
            Em <strong>URIs de redirecionamento autorizados</strong>, adicione
            exatamente:
            <div className="mt-[6px] p-[10px] rounded-[8px] bg-[var(--surface-2)] border border-[var(--border-soft)] font-mono text-[11.5px] break-all select-all">
              {callback}
            </div>
          </li>
          <li>
            Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong>{" "}
            gerados e cole abaixo.
          </li>
        </ol>

        <div className="flex flex-col gap-3 pt-2">
          <label className="text-[12px] text-[var(--muted)]">
            Client ID
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abc.apps.googleusercontent.com"
              autoComplete="off"
              className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
            />
          </label>
          <label className="text-[12px] text-[var(--muted)]">
            Client Secret
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-…"
              autoComplete="off"
              className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={save.isPending}
            className="self-start px-4 py-2 rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[13px] font-semibold disabled:opacity-50"
          >
            {save.isPending ? "Salvando…" : "Salvar credenciais"}
          </button>
          {msg ? <p className="text-[12px] text-[var(--muted)]">{msg}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoogleConnectButton({
  onClick,
  disabled,
  loading,
  label = "Conectar Google",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-[14px] py-[7px] rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] font-inherit text-[12.5px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {label}
    </button>
  );
}

function formatEventWhen(start: string | null, allDay: boolean): string {
  if (!start) return "";
  if (allDay) {
    const d = start.slice(0, 10);
    return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }
  return new Date(start).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function GoogleCard({
  connecting,
  onConnect,
  onSetup,
}: {
  connecting: boolean;
  onConnect: (service: GoogleConnectService) => void;
  onSetup: () => void;
}) {
  const { data: status, isLoading } = useGoogleStatus();
  const importMut = useGoogleImport();
  const disconnect = useGoogleDisconnect();
  const active = !!status?.contacts;
  const configured = status?.configured ?? false;

  function handleConnect() {
    if (!configured) {
      onSetup();
      return;
    }
    onConnect("contacts");
  }

  return (
    <ConnectorCard
        icon={<Contact className="w-5 h-5" />}
        name="Google Contatos"
        description={
          !configured
            ? "Configure as credenciais Google no painel — clique em Conectar para o passo a passo"
            : isLoading
              ? "Verificando conexão..."
              : active
                ? `Sincronizando com ${status?.email ?? "conta Google"}`
                : "Importe seus contatos para o CRM"
        }
      >
        {active ? (
          <>
            <GoogleStatusDot active />
            <button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)] disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importMut.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              Importar / Sincronizar
            </button>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-transparent text-[var(--muted)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--border)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Desconectar
            </button>
          </>
        ) : (
          <>
            <GoogleStatusDot active={false} />
            <GoogleConnectButton
              onClick={handleConnect}
              disabled={connecting}
              loading={connecting}
              label={configured ? "Conectar Google" : "Como configurar"}
            />
          </>
        )}
      </ConnectorCard>
    );
}

function GoogleCalendarCard({
  connecting,
  onConnect,
  onSetup,
}: {
  connecting: boolean;
  onConnect: (service: GoogleConnectService) => void;
  onSetup: () => void;
}) {
  const { data: status, isLoading } = useGoogleStatus();
  const [open, setOpen] = useState(false);
  const active = !!status?.calendar;
  const configured = status?.configured ?? false;
  const { data: events, isLoading: loadingEvents, refetch } = useGoogleCalendarEvents(
    open && active,
    14,
  );

  function handleConnect(service: GoogleConnectService) {
    if (!configured) {
      onSetup();
      return;
    }
    onConnect(service);
  }

  return (
    <>
      <ConnectorCard
        icon={<CalendarDays className="w-5 h-5" />}
        name="Google Calendário"
        description={
          !configured
            ? "Configure as credenciais Google no painel — clique em Conectar para o passo a passo"
            : isLoading
              ? "Verificando conexão..."
              : active
                ? `Agenda de ${status?.email ?? "conta Google"}`
                : "Veja seus compromissos nos próximos 14 dias"
        }
      >
        {active ? (
          <>
            <GoogleStatusDot active />
            <button
              onClick={() => {
                setOpen(true);
                void refetch();
              }}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)]"
            >
              Ver agenda
            </button>
            <GoogleConnectButton
              onClick={() => handleConnect("calendar")}
              disabled={connecting}
              loading={connecting}
              label="Atualizar permissões"
            />
          </>
        ) : (
          <>
            <GoogleStatusDot active={false} />
            <GoogleConnectButton
              onClick={() =>
                handleConnect(status?.connected ? "calendar" : "all")
              }
              disabled={connecting}
              loading={connecting}
              label={
                configured
                  ? status?.connected
                    ? "Autorizar calendário"
                    : "Conectar Google"
                  : "Como configurar"
              }
            />
          </>
        )}
      </ConnectorCard>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[440px] max-w-[92vw] bg-[var(--surface)] border-l border-[var(--border)] p-0 flex flex-col sm:max-w-none">
          <SheetHeader className="p-[22px_22px_18px] border-b border-[var(--border-soft)] space-y-0">
            <SheetTitle className="font-display font-semibold text-[18px]">
              Próximos eventos
            </SheetTitle>
            <SheetDescription className="text-[13px] text-[var(--muted)] mt-1">
              Google Calendar — próximos 14 dias
            </SheetDescription>
          </SheetHeader>
          <div className="p-[20px_22px] overflow-y-auto flex-1">
            {loadingEvents ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
              </div>
            ) : events?.length ? (
              <div className="space-y-[8px]">
                {events.map((ev) => (
                  <div
                    key={`${ev.calendarId}:${ev.id}`}
                    className="bg-[var(--surface-2)] border border-[var(--border-soft)] rounded-[10px] p-[11px_13px]"
                  >
                    <div className="text-[13px] font-semibold leading-snug">
                      {ev.summary || "(Sem título)"}
                    </div>
                    <div className="text-[11.5px] text-[var(--accent)] font-mono mt-[4px]">
                      {formatEventWhen(ev.start, ev.allDay)}
                    </div>
                    {ev.location ? (
                      <div className="text-[12px] text-[var(--muted)] mt-[4px]">
                        {ev.location}
                      </div>
                    ) : null}
                    {ev.calendarSummary ? (
                      <div className="text-[10.5px] text-[var(--muted-2)] mt-[4px]">
                        {ev.calendarSummary}
                      </div>
                    ) : null}
                    {ev.htmlLink ? (
                      <a
                        href={ev.htmlLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] mt-[8px] hover:underline"
                      >
                        Abrir no Google
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-[var(--muted-2)] text-[13px]">
                Nenhum evento nos próximos 14 dias.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function GoogleIntegrations() {
  const { data: status, refetch } = useGoogleStatus();
  const { banner, setBanner, connecting, connect } = useGoogleOAuthBanner();
  const [setupOpen, setSetupOpen] = useState(false);

  return (
    <>
      <GoogleCard
        connecting={connecting}
        onConnect={connect}
        onSetup={() => setSetupOpen(true)}
      />
      <GoogleCalendarCard
        connecting={connecting}
        onConnect={connect}
        onSetup={() => setSetupOpen(true)}
      />
      <GoogleSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        redirectUri={status?.redirectUri ?? null}
        clientIdMasked={status?.clientIdMasked ?? null}
        storedInDb={status?.storedInDb ?? false}
        envFilePath={status?.envFilePath ?? null}
        onSaved={() => void refetch()}
      />
      {banner && <Banner message={banner} onClose={() => setBanner(null)} />}
    </>
  );
}

function formatBrPhone(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const s = String(raw);
  const d = s.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return s;
}

function connectionLabel(state: string, connected: boolean): string {
  if (connected) return "Conectado";
  if (state === "connecting") return "Aguardando QR";
  if (state === "close" || state === "closed") return "Desconectado";
  if (state === "error") return "Erro na API";
  if (state === "unconfigured") return "Não configurado";
  return state;
}

function formatShortBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatMinutesAgo(mins: number | null | undefined): string {
  if (mins == null) return "—";
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function CopyIconButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-[6px] text-[var(--muted-2)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors shrink-0 ${className ?? ""}`}
      title={copied ? "Copiado" : "Copiar"}
    >
      {copied ? (
        <CheckCircle2 className="w-3 h-3 text-[var(--ok)]" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}

function WaMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-[11px] border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3 min-w-0 w-full">
      <div className="font-display text-[22px] sm:text-[20px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--muted-2)] mt-2 font-medium">
        {label}
      </div>
      {sub ? (
        <div className="text-[10px] text-[var(--muted)] mt-1 leading-snug break-words">{sub}</div>
      ) : null}
    </div>
  );
}

function WaCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof Server;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[12px] border border-[var(--border-soft)] bg-[var(--surface-2)]/60 p-4 sm:p-4 min-w-0 w-full ${className ?? ""}`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-7 h-7 rounded-[8px] bg-[var(--surface-3)] flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-[var(--accent)]" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--muted-2)]">
          {title}
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function WaLine({
  label,
  value,
  mono,
  warn,
  copy,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  warn?: boolean;
  copy?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 py-2 border-b border-[var(--border-soft)]/60 last:border-0 sm:grid-cols-[minmax(5.5rem,38%)_1fr] sm:items-center sm:gap-3">
      <span className="text-[11.5px] text-[var(--muted)]">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 sm:justify-end">
        <span
          className={`text-[12.5px] sm:text-[12px] min-w-0 ${
            mono ? "font-mono text-[11px] break-all" : "break-words"
          } ${warn ? "text-[var(--warn,#f5a623)]" : "text-[var(--text)]"} sm:text-right`}
        >
          {value}
        </span>
        {copy ? <CopyIconButton text={copy} /> : null}
      </div>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${
        ok
          ? "bg-[rgba(52,211,153,0.12)] text-[var(--ok)]"
          : "bg-[rgba(248,113,113,0.1)] text-[#F87171]"
      }`}
    >
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function WhatsAppDetailsSheet({
  open,
  onOpenChange,
  status,
  isLoading,
  onRefresh,
  refreshing,
  onDisconnect,
  disconnecting,
  onRegisterWebhook,
  registeringWebhook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: EvolutionStatus | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
  onRegisterWebhook: () => void;
  registeringWebhook: boolean;
}) {
  const d = status?.instanceDetails;
  const jidPhoneRaw =
    d?.ownerJid?.replace(/@.*$/, "") ?? (d?.number != null ? String(d.number) : null);
  const jidPhone = jidPhoneRaw && jidPhoneRaw.length > 0 ? jidPhoneRaw : null;
  const displayPhone = jidPhone ? formatBrPhone(jidPhone) : formatBrPhone(status?.ownerPhone);
  const mirror = status?.mirror;
  const connected = status?.connected ?? false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!fixed !inset-y-3 !right-3 !left-auto !h-[calc(100dvh-24px)] !max-h-[calc(100dvh-24px)] !w-[min(calc(100vw-24px),420px)] sm:!w-[420px] !max-w-[calc(100vw-24px)] rounded-[14px] border border-[var(--border)] shadow-2xl bg-[var(--surface)] p-0 flex flex-col overflow-hidden gap-0 [&>button.absolute]:hidden"
      >
        <SheetHeader className="shrink-0 px-7 pt-7 pb-5 border-b border-[var(--border-soft)] space-y-0 text-left">
          <div className="flex items-start gap-5 min-w-0">
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-display font-semibold text-[17px] flex items-center gap-2 pr-2">
                <MessageCircle className="w-[18px] h-[18px] text-[var(--accent)] shrink-0" />
                <span className="truncate">WhatsApp</span>
              </SheetTitle>
              <SheetDescription className="text-[12px] text-[var(--muted)] mt-1.5 leading-snug pr-2">
                Evolution · sessão e espelho no Sinal
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center justify-center w-9 h-9 rounded-[9px] border border-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <SheetClose asChild>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-[9px] border border-[var(--border-soft)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]"
                  title="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-7 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable]">
          {isLoading && !status ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--muted)]" />
            </div>
          ) : !status?.configured ? (
            <p className="text-[13px] text-[var(--muted)] py-2 leading-relaxed">
              Configure{" "}
              <code className="font-mono text-[11px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                EVOLUTION_API_URL
              </code>{" "}
              e{" "}
              <code className="font-mono text-[11px] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                EVOLUTION_API_KEY
              </code>{" "}
              no servidor.
            </p>
          ) : (
            <div className="flex flex-col gap-4 w-full min-w-0 max-w-full">
              <div
                className={`relative rounded-[14px] border p-4 sm:p-5 overflow-hidden w-full ${
                  connected
                    ? "border-[rgba(52,211,153,0.25)] bg-gradient-to-br from-[rgba(52,211,153,0.08)] to-transparent"
                    : "border-[var(--border-soft)] bg-[var(--surface-2)]/50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <StatusPill
                      ok={connected}
                      label={connectionLabel(status.state, connected)}
                    />
                    {d?.profileName ? (
                      <div className="font-display font-semibold text-[17px] sm:text-[16px] mt-3 truncate">
                        {d.profileName}
                      </div>
                    ) : null}
                    <div className="text-[15px] sm:text-[14px] font-medium text-[var(--text)] mt-1.5 tabular-nums break-words">
                      {displayPhone}
                    </div>
                    {status.instance ? (
                      <div className="flex items-center gap-1.5 mt-2 min-w-0">
                        <span className="font-mono text-[11px] text-[var(--muted)] break-all leading-snug">
                          {status.instance}
                        </span>
                        <CopyIconButton text={status.instance} />
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0 ${
                      connected ? "bg-[rgba(52,211,153,0.15)]" : "bg-[var(--surface-3)]"
                    }`}
                  >
                    <Smartphone
                      className={`w-5 h-5 ${connected ? "text-[var(--ok)]" : "text-[var(--muted-2)]"}`}
                    />
                  </div>
                </div>
              </div>

              {status.phoneMatchesOwner === false && (
                <div className="flex gap-3 p-4 rounded-[12px] border border-[rgba(245,166,35,0.3)] bg-[rgba(245,166,35,0.06)]">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--warn,#f5a623)] mt-0.5" />
                  <p className="text-[12px] text-[var(--warn,#f5a623)] leading-relaxed min-w-0">
                    Número da instância difere do{" "}
                    <code className="font-mono text-[10.5px]">WHATSAPP_OWNER</code>. Mensagens
                    podem não aparecer no dashboard.
                  </p>
                </div>
              )}

              {status.webhookStale && (
                <div className="flex gap-3 p-4 rounded-[12px] border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.06)]">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#F87171] mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[#F87171]">Webhook parado</p>
                    <p className="text-[11.5px] text-[#F87171]/90 mt-1 leading-relaxed">
                      {status.webhookStaleReason ??
                        "Mensagens podem não estar chegando ao Sinal."}
                    </p>
                    <button
                      type="button"
                      onClick={onRegisterWebhook}
                      disabled={registeringWebhook || !status.webhookConfigured}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border border-[rgba(248,113,113,0.4)] text-[11.5px] font-medium text-[#F87171] hover:bg-[rgba(248,113,113,0.1)] disabled:opacity-50"
                    >
                      {registeringWebhook ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Re-registrar webhook
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                <WaMetric
                  label="Mensagens"
                  value={(mirror?.totalMessages ?? 0).toLocaleString("pt-BR")}
                  sub={mirror?.lastMessageAt ? `últ. ${formatShortBr(mirror.lastMessageAt)}` : undefined}
                />
                <WaMetric label="DMs" value={mirror?.privateChats ?? 0} />
                <WaMetric label="Grupos" value={mirror?.groupChats ?? 0} />
              </div>

              <div className="flex flex-col gap-3 w-full min-w-0">
                <WaCard icon={Server} title="Evolution">
                  <WaLine label="Servidor" value={status.server?.host ?? "—"} />
                  {status.server?.version ? (
                    <WaLine
                      label="Versão"
                      value={`${status.server.version}${status.server.clientName ? ` · ${status.server.clientName}` : ""}`}
                    />
                  ) : null}
                  <WaLine
                    label="Instância"
                    value={status.instanceExists ? "Ativa no servidor" : "Não encontrada"}
                    warn={!status.instanceExists}
                  />
                  {d?.integration ? <WaLine label="Integração" value={d.integration} /> : null}
                  {d?.id ? <WaLine label="ID" value={d.id} mono copy={d.id} /> : null}
                </WaCard>

                <div className="grid grid-cols-1 gap-3">
                  <WaCard icon={Link2} title="Webhook · saúde">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <StatusPill
                        ok={status.webhookConfigured}
                        label={status.webhookConfigured ? ".env OK" : "Sem URL"}
                      />
                      <StatusPill
                        ok={status.webhookRegistered}
                        label={status.webhookRegistered ? "Evolution OK" : "Não registrado"}
                      />
                    </div>
                    <WaLine
                      label="Última msg"
                      value={formatMinutesAgo(status.minutesSinceLastMessage)}
                      warn={status.webhookStale}
                    />
                    <WaLine
                      label="Último hit"
                      value={
                        status.lastWebhookAt
                          ? formatMinutesAgo(status.minutesSinceLastWebhook)
                          : "nenhum nesta sessão"
                      }
                      warn={!status.lastWebhookAt && connected}
                    />
                    {status.webhookUrl ? (
                      <div className="flex items-start gap-1.5 mt-2 min-w-0">
                        <p
                          className="font-mono text-[10px] text-[var(--muted)] leading-relaxed break-all flex-1 min-w-0"
                          title={status.webhookUrl}
                        >
                          {status.webhookUrl}
                        </p>
                        <CopyIconButton text={status.webhookUrl} className="mt-0.5" />
                      </div>
                    ) : null}
                    {status.webhookRegisteredUrl &&
                    status.webhookUrl &&
                    status.webhookRegisteredUrl !== status.webhookUrl ? (
                      <p className="text-[10.5px] text-[var(--warn,#f5a623)] mt-2 leading-snug">
                        Evolution usa URL diferente da configurada no .env
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={onRegisterWebhook}
                      disabled={registeringWebhook || !status.webhookConfigured}
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[9px] border border-[var(--border-soft)] text-[11.5px] font-medium text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] disabled:opacity-50"
                    >
                      {registeringWebhook ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Re-registrar webhook na Evolution
                    </button>
                  </WaCard>

                  <WaCard icon={Database} title="Conta Sinal">
                    <WaLine
                      label="Owner"
                      value={formatBrPhone(status.ownerPhone)}
                      copy={status.ownerPhone || undefined}
                    />
                    {status.suggestedInstanceName !== status.instance ? (
                      <WaLine
                        label="Sugerida"
                        value={status.suggestedInstanceName}
                        mono
                        copy={status.suggestedInstanceName}
                      />
                    ) : null}
                  </WaCard>
                </div>

                <WaCard icon={Clock} title="Sessão">
                  {d?.ownerJid ? (
                    <WaLine label="JID" value={d.ownerJid.split("@")[0] + "@…"} mono copy={d.ownerJid} />
                  ) : null}
                  <WaLine label="Criada" value={formatShortBr(d?.createdAt)} />
                  <WaLine label="Atualizada" value={formatShortBr(d?.updatedAt)} />
                  {mirror?.firstMessageAt ? (
                    <WaLine label="1ª msg no Sinal" value={formatShortBr(mirror.firstMessageAt)} />
                  ) : null}
                  {d?.disconnectionAt ? (
                    <WaLine
                      label="Desconectada"
                      value={formatShortBr(d.disconnectionAt)}
                      warn
                    />
                  ) : null}
                  {d?.disconnectionMessage ? (
                    <p className="text-[11.5px] text-[var(--warn,#f5a623)] mt-2 leading-relaxed break-words">
                      {d.disconnectionMessage}
                    </p>
                  ) : null}
                </WaCard>
              </div>

              {connected && (
                <button
                  type="button"
                  onClick={onDisconnect}
                  disabled={disconnecting}
                  className="w-full mt-2 px-4 py-2.5 rounded-[11px] text-[12.5px] font-medium text-[var(--muted)] hover:text-[#F87171] hover:bg-[rgba(248,113,113,0.06)] border border-[var(--border-soft)] hover:border-[rgba(248,113,113,0.25)] disabled:opacity-50 transition-colors"
                >
                  {disconnecting ? "Desconectando…" : "Desconectar sessão"}
                </button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WhatsAppCard() {
  const qc = useQueryClient();
  const [instanceName, setInstanceName] = useState(
    () => getStoredEvolutionInstance() ?? "",
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [recreate, setRecreate] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: status, isLoading, isError, refetch, isFetching } = useEvolutionStatus(instanceName || undefined, {
    poll: qrOpen || detailsOpen,
  });
  const createInstance = useCreateEvolutionInstance();
  const connect = useEvolutionConnect();
  const disconnect = useEvolutionDisconnect();
  const registerWebhook = useRegisterEvolutionWebhook();

  useEffect(() => {
    if (status?.suggestedInstanceName && !instanceName) {
      setInstanceName(status.suggestedInstanceName);
    }
  }, [status?.suggestedInstanceName, instanceName]);

  useEffect(() => {
    if (status?.instance && status.instance !== instanceName) {
      setInstanceName(status.instance);
      setStoredEvolutionInstance(status.instance);
    }
  }, [status?.instance, instanceName]);

  function payload() {
    return {
      instanceName: instanceName.trim(),
      recreate,
    };
  }

  function applyQrcode(data: {
    base64: string | null;
    pairingCode: string | null;
    webhookRegistered?: boolean;
    webhookConfigured?: boolean;
    message?: string | null;
    alreadyExists?: boolean;
    alreadyConnected?: boolean;
  }) {
    if (data.alreadyConnected) {
      setBanner(data.message ?? "WhatsApp já conectado.");
      setQrOpen(false);
      void qc.invalidateQueries({ queryKey: qk.evolutionStatus });
      return;
    }
    if (data.message && data.alreadyExists) {
      setBanner(data.message);
    }
    if (data.base64) {
      setQrBase64(data.base64);
      setPairingCode(data.pairingCode);
      setQrOpen(true);
      setSetupOpen(false);
    }
    if (data.webhookConfigured === false) {
      setBanner(
        "QR aberto. Para receber mensagens no Sinal, configure EVOLUTION_WEBHOOK_URL no .env (ngrok → /api/evolution/webhook).",
      );
    } else if (data.webhookConfigured && data.webhookRegistered === false) {
      setBanner(
        "QR aberto, mas o webhook não foi registrado na Evolution. Mensagens podem não chegar ao Sinal.",
      );
    }
  }

  useEffect(() => {
    if (status?.connected && qrOpen) {
      setQrOpen(false);
      setBanner("WhatsApp conectado com sucesso.");
      qc.invalidateQueries({ queryKey: qk.evolutionStatus });
    }
  }, [status?.connected, qrOpen, qc]);

  useEffect(() => {
    if (!qrOpen || status?.connected || !instanceName) return;
    const id = window.setInterval(() => {
      void fetchEvolutionQrcode(instanceName)
        .then((d) => {
          if (d.base64) setQrBase64(d.base64);
          if (d.pairingCode) setPairingCode(d.pairingCode);
        })
        .catch(() => {});
    }, 20000);
    return () => window.clearInterval(id);
  }, [qrOpen, status?.connected, instanceName]);

  async function handleCreateOnly() {
    const name = instanceName.trim();
    if (!name) {
      setBanner("Informe um nome para a instância.");
      return;
    }
    setStoredEvolutionInstance(name);
    try {
      const data = await createInstance.mutateAsync(payload());
      setSetupOpen(false);
      setBanner(
        data.alreadyExists
          ? `Instância "${data.instance}" já existe na Evolution (${data.state}). Use "Conectar com QR".`
          : `Instância "${data.instance}" criada na Evolution.`,
      );
    } catch {
      setBanner("Não foi possível criar a instância. Verifique o nome e EVOLUTION_* no servidor.");
    }
  }

  async function handleConnectQr() {
    const name = instanceName.trim();
    if (!name) {
      setSetupOpen(true);
      setBanner("Escolha um nome de instância antes de conectar.");
      return;
    }
    setStoredEvolutionInstance(name);
    try {
      const data = await connect.mutateAsync(payload());
      applyQrcode(data);
      if (!data.base64) {
        setBanner(
          data.message ??
            "Instância preparada, mas o QR não veio. Clique em Ver QR ou tente Recriar.",
        );
      }
    } catch {
      setBanner(
        "Falha ao conectar na Evolution. Se o QR falhou antes, marque Recriar instância e tente de novo.",
      );
    }
  }

  async function handleShowQr() {
    if (!instanceName.trim()) return;
    try {
      const data = await fetchEvolutionQrcode(instanceName.trim());
      applyQrcode(data);
      if (!data.base64) {
        setBanner("QR ainda não disponível. Tente Recriar instância.");
      }
    } catch {
      setBanner("Não foi possível obter o QR Code. Tente Recriar instância.");
    }
  }

  const activeInstance = instanceName.trim() || status?.instance || "—";
  const profileName = status?.instanceDetails?.profileName;

  const description = isError
    ? "Erro ao consultar Evolution — reinicie a API e tente de novo"
    : !status?.configured
    ? "Configure EVOLUTION_API_URL e EVOLUTION_API_KEY no servidor"
    : isLoading
      ? "Verificando conexão..."
      : status.connected
        ? profileName
          ? `Conectado como ${profileName} · ${activeInstance}`
          : `Conectado · instância ${activeInstance}`
        : status.state === "connecting"
          ? `Instância ${activeInstance} · escaneie o QR no celular`
          : status.instanceExists
            ? `Instância ${activeInstance} existe · pronta para conectar`
            : "Escolha o nome da instância e conecte via QR";

  const statusBadge =
    status?.connected ? (
      <span className="text-[var(--ok)] flex items-center gap-1.5 mr-2">
        <span className="w-[8px] h-[8px] rounded-full bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]"></span>
        Ativo
      </span>
    ) : status?.state === "connecting" && qrOpen ? (
      <span className="text-[var(--warn,#f5a623)] flex items-center gap-1.5 mr-2">
        <span className="w-[8px] h-[8px] rounded-full bg-[var(--warn,#f5a623)] animate-pulse"></span>
        Aguardando QR
      </span>
    ) : (
      <span className="text-[var(--muted-2)] flex items-center gap-1.5 mr-2">
        <span className="w-[8px] h-[8px] rounded-full bg-[var(--muted-2)]"></span>
        Inativo
      </span>
    );

  return (
    <>
      <ConnectorCard
        icon={<MessageCircle className="w-5 h-5" />}
        name="WhatsApp"
        description={description}
        onDetails={status?.configured || isLoading ? () => setDetailsOpen(true) : undefined}
      >
        {!status?.configured ? (
          <span className="text-[var(--muted-2)] text-[12px]">Não configurado</span>
        ) : isError ? (
          <button
            onClick={() => void refetch()}
            className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold"
          >
            Tentar de novo
          </button>
        ) : status.connected ? (
          <>
            {statusBadge}
            <button
              onClick={() => disconnect.mutate(payload())}
              disabled={disconnect.isPending}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-transparent text-[var(--muted)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:text-[var(--text)] disabled:opacity-50"
            >
              Desconectar
            </button>
          </>
        ) : (
          <>
            {statusBadge}
            <button
              onClick={() => setSetupOpen(true)}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)]"
            >
              Configurar
            </button>
            {(status.state === "connecting" || status.instanceExists) && (
              <button
                onClick={handleShowQr}
                className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer hover:border-[var(--accent-dim)]"
              >
                Ver QR
              </button>
            )}
            <button
              onClick={handleConnectQr}
              disabled={connect.isPending}
              className="px-[14px] py-[7px] rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] font-inherit text-[12.5px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
            >
              {connect.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Conectar com QR
            </button>
          </>
        )}
      </ConnectorCard>

      <WhatsAppDetailsSheet
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        status={status}
        isLoading={isLoading}
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onDisconnect={() => disconnect.mutate(payload())}
        disconnecting={disconnect.isPending}
        onRegisterWebhook={() =>
          registerWebhook.mutate(payload(), {
            onSuccess: () => setBanner("Webhook re-registrado na Evolution."),
            onError: () =>
              setBanner("Falha ao registrar webhook. Verifique ngrok e EVOLUTION_WEBHOOK_URL."),
          })
        }
        registeringWebhook={registerWebhook.isPending}
      />

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-[440px] bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>Configurar instância WhatsApp</DialogTitle>
            <DialogDescription className="text-[var(--muted)]">
              A Evolution API é compartilhada. Use um nome único (ex.:{" "}
              {status?.suggestedInstanceName ?? "sinal-seunumero"}).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <label className="flex flex-col gap-2 text-[13px]">
              <span className="text-[var(--muted)]">Nome da instância</span>
              <input
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder={status?.suggestedInstanceName ?? "sinal-5531..."}
                className="px-3 py-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] font-mono text-[13px] outline-none focus:border-[var(--accent-dim)]"
              />
            </label>
            <label className="flex items-start gap-2 text-[12.5px] text-[var(--muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={recreate}
                onChange={(e) => setRecreate(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Apagar e recriar se já existir (use se o QR falhou ou ficou
                travado em &quot;conectando&quot;)
              </span>
            </label>
            <div className="flex flex-wrap gap-2 justify-end pt-1">
              <button
                onClick={() => setSetupOpen(false)}
                className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-transparent text-[var(--muted)] font-inherit text-[12.5px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateOnly}
                disabled={createInstance.isPending}
                className="px-[14px] py-[7px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] font-inherit text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              >
                {createInstance.isPending && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                Só criar
              </button>
              <button
                onClick={handleConnectQr}
                disabled={connect.isPending}
                className="px-[14px] py-[7px] rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] font-inherit text-[12.5px] font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
              >
                {connect.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Criar e conectar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-[380px] bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription className="text-[var(--muted)]">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
              Escaneie o QR abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrBase64 ? (
              <img
                src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                className="w-[260px] h-[260px] rounded-lg bg-white p-2"
              />
            ) : (
              <div className="w-[260px] h-[260px] flex items-center justify-center rounded-lg bg-[var(--surface-2)]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--muted)]" />
              </div>
            )}
            {pairingCode && (
              <p className="text-[13px] text-[var(--muted)]">
                Código de pareamento:{" "}
                <span className="font-mono text-[var(--text)]">{pairingCode}</span>
              </p>
            )}
            <p className="text-[12px] text-[var(--muted-2)] text-center">
              Instância: <span className="font-mono text-[var(--text)]">{activeInstance}</span>.
              O QR expira em ~60s e renova sozinho. Se o celular disser que não
              conectou, feche, marque &quot;Apagar e recriar&quot; em Configurar e tente de novo.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {banner && <Banner message={banner} onClose={() => setBanner(null)} />}
    </>
  );
}

export default function Conectores() {
  return (
    <div className="flex flex-col gap-7 animate-in fade-in slide-in-from-bottom-2 duration-400 max-w-[860px]">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Ferramentas
          </h3>
          <p className="text-[12.5px] text-[var(--muted-2)] mt-[3px]">
            Integrações com serviços externos.
          </p>
        </div>
        <GoogleIntegrations />
        <WhatsAppCard />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
            Conexões técnicas
          </h3>
          <p className="text-[12.5px] text-[var(--muted-2)] mt-[3px]">
            Acesso aos seus dados via API e ferramentas de IA.
          </p>
        </div>
        <ConnectorCard
          icon={<Code2 className="w-5 h-5" />}
          name="API"
          description="Acesse seus dados do Sinal por uma API REST."
        >
          <span className="px-[12px] py-[6px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-2)] text-[12px] font-semibold">
            Em breve
          </span>
        </ConnectorCard>
        <ConnectorCard
          icon={<Bot className="w-5 h-5" />}
          name="Claude (MCP)"
          description="Conecte o Claude aos seus dados via MCP."
        >
          <span className="px-[12px] py-[6px] rounded-[9px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-2)] text-[12px] font-semibold">
            Em breve
          </span>
        </ConnectorCard>
      </section>
    </div>
  );
}
