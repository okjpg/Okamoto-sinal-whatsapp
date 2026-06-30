import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAiModels,
  useAiSettings,
  useAiStatus,
  useSaveAiCredentials,
  useSaveAiSettings,
  useTestAiConnection,
  ApiError,
  type AiSelectionMode,
  type AiTaskType,
  type OpenRouterModelDto,
} from "@/lib/api";
import {
  Loader2,
  Sparkles,
  Check,
  KeyRound,
  RefreshCw,
  Search,
  Wifi,
} from "lucide-react";

const MODES: {
  id: AiSelectionMode;
  title: string;
  description: string;
}[] = [
  {
    id: "auto_free",
    title: "1. Free automático",
    description:
      "O Sinal escolhe os melhores modelos gratuitos do OpenRouter (DeepSeek, Gemini Flash, Llama, etc.).",
  },
  {
    id: "pick_free",
    title: "2. Escolher modelos free",
    description: "Você seleciona modelos gratuitos, agrupados por finalidade.",
  },
  {
    id: "pick_paid",
    title: "3. Escolher modelos pagos",
    description: "Modelos premium ordenados do melhor para o pior (consome créditos).",
  },
  {
    id: "by_task",
    title: "4. Por tipo de tarefa",
    description:
      "Defina um modelo diferente para texto, áudio, imagem, vídeo e cada etapa do pipeline.",
  },
];

const TASK_LABELS: Record<AiTaskType, string> = {
  classify: "Texto — classificação",
  cluster: "Texto — pautas",
  mentions: "Texto — menções",
  contact_analysis: "Texto — análise de contato",
  audio: "Áudio",
  image: "Imagem",
  video: "Vídeo",
};

function filterModels(models: OpenRouterModelDto[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return models;
  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.useCaseLabel?.toLowerCase().includes(q) ||
      m.priceLabel?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q),
  );
}

function ModelListToolbar({
  search,
  onSearchChange,
  onRefresh,
  isRefreshing,
  count,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  count: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar modelo…"
          className="w-full pl-8 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px]"
        />
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[9px] border border-[var(--border)] text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        Atualizar
      </button>
      <span className="text-[11px] text-[var(--muted)]">{count} modelos</span>
    </div>
  );
}

function ModelPicker({
  models,
  selected,
  onChange,
  multiple,
  variant,
  search,
  onSearchChange,
  onRefresh,
  isRefreshing,
  isLoading,
}: {
  models: OpenRouterModelDto[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  variant: "free" | "paid" | "all";
  search: string;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isLoading?: boolean;
}) {
  const filtered = useMemo(() => filterModels(models, search), [models, search]);

  if (isLoading) {
    return (
      <div className="py-8 flex justify-center text-[var(--muted)] text-[12px]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Carregando modelos…
      </div>
    );
  }

  return (
    <div>
      <ModelListToolbar
        search={search}
        onSearchChange={onSearchChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        count={filtered.length}
      />
      {models.length === 0 ? (
        <p className="text-[12px] text-[var(--muted)]">
          Nenhum modelo. Clique em Atualizar ou teste a conexão.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-[12px] text-[var(--muted)]">Nenhum resultado para &quot;{search}&quot;.</p>
      ) : (
        <div className="max-h-[280px] overflow-y-auto border border-[var(--border-soft)] rounded-[var(--radius)] divide-y divide-[var(--border-soft)]">
          {filtered.map((m) => {
            const active = selected.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  if (multiple) {
                    onChange(
                      active
                        ? selected.filter((x) => x !== m.id)
                        : [...selected, m.id],
                    );
                  } else {
                    onChange([m.id]);
                  }
                }}
                className={`w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] ${
                  active ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/20"
                        : "border-[var(--border)]"
                    }`}
                  >
                    {active ? (
                      <Check className="w-3 h-3 text-[var(--accent)]" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium truncate">{m.name}</span>
                      {variant === "free" && m.useCaseLabel ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-3)] text-[var(--muted)]">
                          {m.useCaseLabel}
                        </span>
                      ) : null}
                      {variant === "paid" && m.qualityLabel ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                          {m.qualityRank != null ? `#${m.qualityRank} · ` : ""}
                          {m.qualityLabel}
                        </span>
                      ) : null}
                      {m.priceLabel ? (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            variant === "paid"
                              ? "bg-[var(--surface-3)] text-[var(--text)]"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {m.priceLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[10px] font-mono text-[var(--muted)] truncate mt-0.5">
                      {m.id}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskModelSelect({
  models,
  value,
  onChange,
  search,
  onSearchChange,
}: {
  models: OpenRouterModelDto[];
  value: string;
  onChange: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const filtered = useMemo(() => filterModels(models, search), [models, search]);
  const selected = models.find((m) => m.id === value);

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="text-[11px] font-mono text-[var(--muted)] truncate">
          Selecionado: {selected.name}
        </div>
      ) : (
        <div className="text-[11px] text-[var(--muted)]">Automático (free)</div>
      )}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar modelo para esta tarefa…"
          className="w-full pl-8 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px]"
        />
      </div>
      <div className="max-h-[160px] overflow-y-auto border border-[var(--border-soft)] rounded-[9px]">
        <button
          type="button"
          onClick={() => onChange("")}
          className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--surface-2)] ${
            !value ? "bg-[var(--surface-2)]" : ""
          }`}
        >
          Automático (free)
        </button>
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[var(--surface-2)] border-t border-[var(--border-soft)] ${
              value === m.id ? "bg-[var(--surface-2)]" : ""
            }`}
          >
            <div className="font-medium">{m.name}</div>
            <div className="text-[10px] text-[var(--muted)] font-mono truncate">
              {m.useCaseLabel ? `${m.useCaseLabel} · ` : ""}
              {m.priceLabel ? `${m.priceLabel} · ` : ""}
              {m.id}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Configuracoes() {
  const qc = useQueryClient();
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useAiStatus();
  const { data, isLoading } = useAiSettings();
  const save = useSaveAiSettings();
  const saveCredentials = useSaveAiCredentials();
  const testConnection = useTestAiConnection();
  const openRouterReady = Boolean(status?.openRouterConfigured);

  const freeModels = useAiModels("free", openRouterReady);
  const paidModels = useAiModels("paid", openRouterReady);
  const allModels = useAiModels("all", openRouterReady);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://openrouter.ai/api/v1");
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<AiSelectionMode>("auto_free");
  const [selectedFree, setSelectedFree] = useState<string[]>([]);
  const [selectedPaid, setSelectedPaid] = useState<string[]>([]);
  const [byTask, setByTask] = useState<Partial<Record<AiTaskType, string>>>({});
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [freeSearch, setFreeSearch] = useState("");
  const [paidSearch, setPaidSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState<Partial<Record<AiTaskType, string>>>({});

  useEffect(() => {
    if (status?.baseUrl) setBaseUrl(status.baseUrl);
  }, [status?.baseUrl]);

  useEffect(() => {
    if (!data?.settings) return;
    setMode(data.settings.mode);
    setSelectedFree(data.settings.selectedFreeModels ?? []);
    setSelectedPaid(data.settings.selectedPaidModels ?? []);
    setByTask(data.settings.byTask ?? {});
  }, [data?.settings]);

  const resolved = data?.resolvedModels;
  const taskTypes = useMemo(
    () => Object.keys(TASK_LABELS) as AiTaskType[],
    [],
  );

  function refreshModels() {
    void qc.invalidateQueries({ queryKey: ["ai", "models"] });
  }

  async function handleTestConnection(useFormKey = false) {
    setTestMsg(null);
    try {
      const result = await testConnection.mutateAsync(
        useFormKey && apiKey.trim()
          ? { apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined }
          : undefined,
      );
      if (result.ok) {
        const parts = [
          "Conexão OK",
          result.latencyMs != null ? `${result.latencyMs}ms` : null,
          result.modelsCount != null ? `${result.modelsCount} modelos` : null,
          result.storedInDb ? "salva no banco" : "não persistida no banco",
          result.label ? `conta: ${result.label}` : null,
        ].filter(Boolean);
        setTestMsg(parts.join(" · "));
        if (useFormKey) void refetchStatus();
      } else {
        setTestMsg(result.message ?? result.error ?? "Falha na conexão.");
      }
    } catch (e) {
      const err = e as ApiError;
      setTestMsg(err.message || "Erro ao testar conexão.");
    }
  }

  async function handleSaveCredentials() {
    setCredMsg(null);
    if (!apiKey.trim()) {
      setCredMsg("Informe a chave OpenRouter.");
      return;
    }
    try {
      const result = await saveCredentials.mutateAsync({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
      });
      setApiKey("");
      setCredMsg(
        result.envUpdated
          ? `Chave criptografada e salva. .env: ${result.envFilePath ?? status?.envFilePath ?? ".env"}`
          : "Chave criptografada e salva no banco.",
      );
      await refetchStatus();
      refreshModels();
    } catch (e) {
      const err = e as ApiError;
      const code =
        err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "";
      if (code === "session_secret_required") {
        setCredMsg("Defina SESSION_SECRET no .env antes de salvar.");
      } else if (code === "invalid_api_key_format") {
        setCredMsg("Formato inválido — a chave deve começar com sk-.");
      } else if (code === "env_write_failed") {
        setCredMsg("Salva no banco, mas falhou ao escrever o .env.");
      } else {
        setCredMsg("Erro ao salvar a chave.");
      }
    }
  }

  async function handleSave() {
    setSavedMsg(null);
    const cleanByTask = Object.fromEntries(
      Object.entries(byTask).filter((entry): entry is [AiTaskType, string] =>
        Boolean(entry[1]),
      ),
    );
    try {
      await save.mutateAsync({
        mode,
        selectedFreeModels: selectedFree,
        selectedPaidModels: selectedPaid,
        byTask: cleanByTask,
      });
      setSavedMsg("Configuração salva.");
    } catch (e) {
      const err = e as ApiError;
      const code =
        err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "";
      setSavedMsg(
        code === "invalid_settings"
          ? "Dados inválidos — tente de novo."
          : err.message || "Erro ao salvar.",
      );
    }
  }

  if (statusLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--muted)]">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando configurações…
      </div>
    );
  }

  return (
    <div className="max-w-[720px] flex flex-col gap-6">
      <div>
        <h2 className="font-display text-[22px] font-semibold tracking-tight">
          Inteligência (IA)
        </h2>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          Modelos OpenRouter para classificação, pautas, menções e mídia.
        </p>
      </div>

      <section className="p-4 rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--surface)] flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-[14px] font-semibold">Chave OpenRouter</h3>
        </div>
        <p className="text-[12.5px] text-[var(--muted)]">
          Criptografada no banco (AES-256-GCM) e espelhada no{" "}
          <code className="text-[11px]">.env</code>.
        </p>

        <div className="flex flex-wrap gap-2 text-[12px]">
          {status?.apiKeyMasked ? (
            <span className="text-emerald-400 font-mono">
              Ativa: {status.apiKeyMasked}
            </span>
          ) : (
            <span className="text-amber-400">Nenhuma chave detectada</span>
          )}
          {status?.storedInDb ? (
            <span className="text-[var(--muted)]">· banco ✓</span>
          ) : (
            <span className="text-amber-400">· banco ✗</span>
          )}
        </div>

        <label className="text-[12px] text-[var(--muted)]">
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
          />
        </label>
        <label className="text-[12px] text-[var(--muted)]">
          Base URL
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSaveCredentials()}
            disabled={saveCredentials.isPending}
            className="px-4 py-2 rounded-[9px] border border-[var(--accent)] text-[var(--accent)] text-[13px] font-semibold disabled:opacity-50"
          >
            {saveCredentials.isPending ? "Salvando…" : "Salvar chave"}
          </button>
          <button
            type="button"
            onClick={() => void handleTestConnection(Boolean(apiKey.trim()))}
            disabled={testConnection.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] border border-[var(--border)] text-[13px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {testConnection.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            Testar conexão
          </button>
        </div>
        {credMsg ? (
          <p className="text-[12px] text-[var(--muted)]">{credMsg}</p>
        ) : null}
        {testMsg ? (
          <p
            className={`text-[12px] ${
              testMsg.startsWith("Conexão OK")
                ? "text-emerald-400"
                : "text-amber-400"
            }`}
          >
            {testMsg}
          </p>
        ) : null}
      </section>

      {!openRouterReady ? (
        <div className="p-4 rounded-[var(--radius)] border border-amber-500/30 bg-amber-500/10 text-[13px]">
          Salve a chave e use <strong>Testar conexão</strong> para confirmar. O
          teste também indica se a chave está persistida no banco.
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-emerald-400">
          <Sparkles className="w-4 h-4" />
          OpenRouter conectado
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em]">
          Modo de seleção
        </h3>
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`text-left p-4 rounded-[var(--radius)] border transition-colors ${
              mode === m.id
                ? "border-[var(--accent)] bg-[var(--accent)]/5"
                : "border-[var(--border-soft)] bg-[var(--surface)] hover:border-[var(--border)]"
            }`}
          >
            <div className="font-semibold text-[14px]">{m.title}</div>
            <div className="text-[12.5px] text-[var(--muted)] mt-1">
              {m.description}
            </div>
          </button>
        ))}
      </section>

      {mode === "auto_free" && data?.autoFreeDefaults ? (
        <section className="text-[12.5px] text-[var(--muted-2)]">
          <p className="mb-2">Prioridade automática (texto):</p>
          <ul className="list-disc pl-5 space-y-1 font-mono text-[11px]">
            {data.autoFreeDefaults.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {mode === "pick_free" ? (
        <section>
          <h3 className="text-[13px] font-semibold mb-2">Modelos gratuitos</h3>
          <ModelPicker
            variant="free"
            models={freeModels.data?.models ?? []}
            selected={selectedFree}
            onChange={setSelectedFree}
            multiple
            search={freeSearch}
            onSearchChange={setFreeSearch}
            onRefresh={refreshModels}
            isRefreshing={freeModels.isFetching}
            isLoading={freeModels.isLoading}
          />
        </section>
      ) : null}

      {mode === "pick_paid" ? (
        <section>
          <h3 className="text-[13px] font-semibold mb-2">
            Modelos pagos (melhor → pior)
          </h3>
          <ModelPicker
            variant="paid"
            models={paidModels.data?.models ?? []}
            selected={selectedPaid}
            onChange={setSelectedPaid}
            multiple
            search={paidSearch}
            onSearchChange={setPaidSearch}
            onRefresh={refreshModels}
            isRefreshing={paidModels.isFetching}
            isLoading={paidModels.isLoading}
          />
        </section>
      ) : null}

      {mode === "by_task" ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[var(--muted)]">
              Busque e escolha um modelo por tarefa.
            </p>
            <button
              type="button"
              onClick={refreshModels}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)]"
            >
              <RefreshCw
                className={`w-3 h-3 ${allModels.isFetching ? "animate-spin" : ""}`}
              />
              Atualizar lista
            </button>
          </div>
          {taskTypes.map((task) => (
            <div key={task}>
              <label className="text-[12px] font-medium text-[var(--muted)] block mb-2">
                {TASK_LABELS[task]}
              </label>
              <TaskModelSelect
                models={allModels.data?.models ?? []}
                value={byTask[task] ?? ""}
                onChange={(id) =>
                  setByTask((prev) => ({
                    ...prev,
                    [task]: id || undefined,
                  }))
                }
                search={taskSearch[task] ?? ""}
                onSearchChange={(v) =>
                  setTaskSearch((prev) => ({ ...prev, [task]: v }))
                }
              />
            </div>
          ))}
        </section>
      ) : null}

      {resolved ? (
        <section className="p-4 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border-soft)]">
          <h3 className="text-[12px] font-semibold text-[var(--muted)] uppercase mb-2">
            Modelos ativos agora
          </h3>
          <dl className="grid gap-1 text-[12px] font-mono">
            {Object.entries(resolved).map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-2">
                  <dt className="text-[var(--muted)] w-28 shrink-0">{k}</dt>
                  <dd className="truncate">{v}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </section>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={save.isPending || !openRouterReady}
          className="px-4 py-2 rounded-[9px] bg-[var(--accent)] text-[#06201e] text-[13px] font-semibold disabled:opacity-50"
        >
          {save.isPending ? "Salvando…" : "Salvar configuração"}
        </button>
        {savedMsg ? (
          <span className="text-[12px] text-[var(--muted)]">{savedMsg}</span>
        ) : null}
      </div>
    </div>
  );
}
