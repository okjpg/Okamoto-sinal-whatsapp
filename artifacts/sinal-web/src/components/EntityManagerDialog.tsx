import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useEntities,
  useCreateEntity,
  useUpdateEntity,
  useDeleteEntity,
  type Entity,
} from "@/lib/api";
import { Tags, Plus, X, Trash2, Loader2 } from "lucide-react";

const TYPE_OPTIONS = [
  { value: "person", label: "Pessoa" },
  { value: "product", label: "Produto" },
  { value: "other", label: "Outro" },
];

function typeLabel(type: string) {
  return TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function KeywordEditor({ entity }: { entity: Entity }) {
  const update = useUpdateEntity();
  const [draft, setDraft] = useState("");
  const aliases = entity.aliases ?? [];

  const addKeyword = () => {
    const v = draft.trim();
    if (!v) return;
    if (aliases.some((a) => a.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    update.mutate({ id: entity.id, data: { aliases: [...aliases, v] } });
    setDraft("");
  };

  const removeKeyword = (kw: string) => {
    update.mutate({
      id: entity.id,
      data: { aliases: aliases.filter((a) => a !== kw) },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {aliases.map((kw) => (
        <span
          key={kw}
          className="inline-flex items-center gap-[5px] text-[12px] px-[9px] py-[3px] rounded-[14px] bg-[var(--surface-3)] text-[var(--text)] border border-[var(--border)]"
        >
          {kw}
          <button
            onClick={() => removeKeyword(kw)}
            aria-label={`Remover ${kw}`}
            className="text-[var(--muted-2)] hover:text-[var(--danger)] transition-[0.14s]"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addKeyword();
          }
        }}
        onBlur={addKeyword}
        placeholder="+ palavra-chave"
        className="text-[12px] bg-transparent border-none outline-none text-[var(--text)] placeholder:text-[var(--muted-2)] min-w-[130px] py-[3px]"
      />
      {update.isPending && (
        <Loader2 className="w-3 h-3 animate-spin text-[var(--muted-2)]" />
      )}
    </div>
  );
}

function EntityRow({ entity }: { entity: Entity }) {
  const del = useDeleteEntity();
  const update = useUpdateEntity();
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(entity.name);

  useEffect(() => {
    setName(entity.name);
  }, [entity.name]);

  const commitName = () => {
    const v = name.trim();
    if (!v) {
      setName(entity.name);
      return;
    }
    if (v !== entity.name) {
      update.mutate({ id: entity.id, data: { name: v } });
    }
  };

  return (
    <div className="py-[14px] border-b border-[var(--border-soft)] last:border-none">
      <div className="flex items-center justify-between mb-[8px]">
        <div className="flex items-center gap-[8px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={`Nome de ${entity.name}`}
            title="Clique para editar o nome"
            className="text-[13.5px] font-semibold text-[var(--text)] bg-transparent border border-transparent rounded-[6px] px-[6px] py-[2px] -ml-[6px] outline-none hover:border-[var(--border)] focus:border-[var(--accent-dim)] focus:bg-[var(--surface-2)] transition-[0.14s] max-w-[180px] cursor-text"
          />
          <select
            value={entity.type}
            onChange={(e) =>
              update.mutate({ id: entity.id, data: { type: e.target.value } })
            }
            aria-label={`Tipo de ${entity.name}`}
            className="text-[10.5px] uppercase tracking-[0.04em] text-[var(--muted-2)] bg-[var(--surface-3)] border border-[var(--border)] px-[7px] py-[2px] rounded-[5px] outline-none focus:border-[var(--accent-dim)] cursor-pointer"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {typeLabel(o.value)}
              </option>
            ))}
          </select>
          <span className="text-[11px] font-mono text-[var(--muted-2)]">
            {entity.mention_count} menç{entity.mention_count === 1 ? "ão" : "ões"}
          </span>
        </div>
        {confirming ? (
          <div className="flex items-center gap-[8px] text-[12px]">
            <span className="text-[var(--muted)]">Excluir?</span>
            <button
              onClick={() => del.mutate(entity.id)}
              disabled={del.isPending}
              className="font-semibold text-[var(--danger)] hover:underline disabled:opacity-50"
            >
              Excluir
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[var(--muted)] hover:text-[var(--text)]"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={`Excluir ${entity.name}`}
            className="text-[var(--muted-2)] hover:text-[var(--danger)] transition-[0.14s]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <KeywordEditor entity={entity} />
    </div>
  );
}

function NewEntityForm() {
  const create = useCreateEntity();
  const [name, setName] = useState("");
  const [type, setType] = useState("person");
  const [keywords, setKeywords] = useState("");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const aliases = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    create.mutate(
      { name: trimmed, type, aliases },
      {
        onSuccess: () => {
          setName("");
          setKeywords("");
          setType("person");
        },
      },
    );
  };

  return (
    <div className="mt-[6px] pt-[16px] border-t border-[var(--border)]">
      <h4 className="text-[12px] font-semibold text-[var(--muted)] uppercase tracking-[0.02em] mb-[10px]">
        Nova entidade
      </h4>
      <div className="flex flex-col gap-[8px]">
        <div className="flex gap-[8px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Abel Odorico, OpenClaw)"
            className="flex-1 text-[13px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] px-[11px] py-[7px] text-[var(--text)] placeholder:text-[var(--muted-2)] outline-none focus:border-[var(--accent-dim)]"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="text-[13px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] px-[11px] py-[7px] text-[var(--text)] outline-none focus:border-[var(--accent-dim)]"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
            placeholder="Palavras-chave separadas por vírgula (ex.: abel, abel odorico)"
          className="text-[13px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[8px] px-[11px] py-[7px] text-[var(--text)] placeholder:text-[var(--muted-2)] outline-none focus:border-[var(--accent-dim)]"
        />
        <button
          onClick={submit}
          disabled={!name.trim() || create.isPending}
          className="self-start inline-flex items-center gap-[6px] text-[12.5px] font-semibold px-[14px] py-[7px] rounded-[8px] bg-[var(--accent)] text-[#04201f] disabled:opacity-50 transition-[0.14s]"
        >
          {create.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          Adicionar entidade
        </button>
      </div>
    </div>
  );
}

export default function EntityManagerDialog() {
  const { data: entities, isLoading } = useEntities();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-[6px] text-[12.5px] px-[13px] py-[6px] rounded-[20px] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] cursor-pointer transition-[0.14s] font-medium hover:text-[var(--text)] hover:border-[var(--accent-dim)]">
          <Tags className="w-3.5 h-3.5" />
          Entidade monitorada
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[640px] max-h-[80vh] overflow-y-auto bg-[var(--surface)] border-[var(--border-soft)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">
            Entidade monitorada
          </DialogTitle>
          <DialogDescription className="text-[var(--muted)]">
            Clique no nome para editar quem você monitora. Adicione palavras-chave
            para a IA detectar menções indiretas. @-mentions do WhatsApp são
            capturadas automaticamente.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <div className="flex flex-col">
            {entities?.length ? (
              entities.map((ent) => <EntityRow key={ent.id} entity={ent} />)
            ) : (
              <div className="text-center py-6 text-[var(--muted-2)] text-[13px]">
                Nenhuma entidade cadastrada ainda.
              </div>
            )}
            <NewEntityForm />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
