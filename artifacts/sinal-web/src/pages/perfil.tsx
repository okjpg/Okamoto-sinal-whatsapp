import { useEffect, useState } from "react";
import {
  useProfile,
  useChangePassword,
  useLogout,
  useSmtpSettings,
  useSaveSmtpSettings,
  useTestSmtp,
  type ApiError,
} from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";
import {
  Loader2,
  User,
  KeyRound,
  Mail,
  LogOut,
  Server,
  Wifi,
} from "lucide-react";

function sanitizeSmtpField(value: string): string {
  let s = value.trim();
  while (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function smtpErrorMessage(err: ApiError): string {
  const data = err.data;
  if (data && typeof data === "object" && "message" in data) {
    const msg = (data as { message?: string }).message;
    if (msg) return msg;
  }
  if (err.message === "smtp_password_required") {
    return "Informe a senha SMTP (senha de app do Gmail).";
  }
  if (err.message === "invalid_smtp_settings") {
    return "Dados inválidos. Use smtp.gmail.com sem aspas e e-mail válido no remetente.";
  }
  return "Erro ao salvar SMTP.";
}

export default function Perfil() {
  const { data: profile, isLoading } = useProfile();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const { data: smtpStatus, refetch: refetchSmtp } = useSmtpSettings(
    profile?.isOwner ?? false,
  );
  const saveSmtp = useSaveSmtpSettings();
  const testSmtp = useTestSmtp();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("Sinal");
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!smtpStatus) return;
    if (smtpStatus.host) setSmtpHost(smtpStatus.host);
    if (smtpStatus.port) setSmtpPort(String(smtpStatus.port));
    setSmtpSecure(!!smtpStatus.secure);
    if (smtpStatus.user) setSmtpUser(smtpStatus.user);
    else if (smtpStatus.fromEmail) setSmtpUser(smtpStatus.fromEmail);
    if (smtpStatus.fromEmail) setSmtpFromEmail(smtpStatus.fromEmail);
    if (smtpStatus.fromName) setSmtpFromName(smtpStatus.fromName);
  }, [smtpStatus]);

  async function handleChangePassword() {
    setPwdMsg(null);
    if (newPassword.length < 8) {
      setPwdMsg("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg("As senhas não coincidem.");
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdMsg("Senha atualizada com sucesso.");
    } catch (e) {
      const err = e as ApiError;
      const code =
        err.data && typeof err.data === "object" && "error" in err.data
          ? String((err.data as { error?: string }).error)
          : "";
      if (code === "invalid_current_password") {
        setPwdMsg("Senha atual incorreta.");
      } else if (code === "password_mismatch") {
        setPwdMsg("As senhas não coincidem.");
      } else {
        setPwdMsg("Erro ao alterar a senha.");
      }
    }
  }

  async function handleSaveSmtp() {
    setSmtpMsg(null);
    const host = sanitizeSmtpField(smtpHost);
    const fromEmail = sanitizeSmtpField(smtpFromEmail);
    const user = sanitizeSmtpField(smtpUser);
    const fromName = sanitizeSmtpField(smtpFromName) || "Sinal";
    const port = Number(sanitizeSmtpField(smtpPort)) || 587;
    const secure = port === 465 ? true : port === 587 ? false : smtpSecure;
    const password = sanitizeSmtpField(smtpPassword);

    if (!host || !fromEmail) {
      setSmtpMsg("Preencha host e e-mail remetente (sem aspas).");
      return;
    }
    if (!smtpStatus?.configured && !password) {
      setSmtpMsg("Informe a senha SMTP na primeira configuração.");
      return;
    }
    try {
      const result = await saveSmtp.mutateAsync({
        host,
        port,
        secure,
        user,
        ...(password ? { password } : {}),
        fromEmail,
        fromName,
      });
      setSmtpHost(host);
      setSmtpPort(String(port));
      setSmtpSecure(secure);
      setSmtpUser(result.user ?? user);
      setSmtpFromEmail(fromEmail);
      setSmtpFromName(fromName);
      setSmtpPassword("");
      setSmtpMsg(
        result.envUpdated
          ? `SMTP salvo e .env atualizado (${result.envFilePath ?? ".env"}).`
          : "SMTP salvo no banco.",
      );
      void refetchSmtp();
    } catch (e) {
      setSmtpMsg(smtpErrorMessage(e as ApiError));
    }
  }

  async function handleTestSmtp() {
    setTestMsg(null);
    const host = sanitizeSmtpField(smtpHost);
    const fromEmail = sanitizeSmtpField(smtpFromEmail);
    const user = sanitizeSmtpField(smtpUser);
    const fromName = sanitizeSmtpField(smtpFromName) || "Sinal";
    const port = Number(sanitizeSmtpField(smtpPort)) || 587;
    const secure = port === 465 ? true : port === 587 ? false : smtpSecure;
    const password = sanitizeSmtpField(smtpPassword);
    try {
      const result = await testSmtp.mutateAsync(
        password
          ? {
              host,
              port,
              secure,
              user,
              password,
              fromEmail,
              fromName,
            }
          : undefined,
      );
      setTestMsg(result.ok ? `E-mail de teste enviado para ${result.to}.` : "Falha no teste.");
    } catch (e) {
      const err = e as ApiError;
      const msg =
        err.data && typeof err.data === "object" && "message" in err.data
          ? String((err.data as { message?: string }).message)
          : "Falha ao testar SMTP.";
      setTestMsg(msg);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-[720px] flex flex-col gap-[20px]">
      <div>
        <h2 className="font-display text-[22px] font-semibold tracking-tight">
          Perfil &amp; conta
        </h2>
        <p className="text-[13px] text-[var(--muted)] mt-1">
          Usuário, senha e (admin) configuração de e-mail para recuperação.
        </p>
      </div>

      <section className="p-4 rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--surface)] flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-[14px] font-semibold">Usuário</h3>
        </div>
        <div className="grid gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border-soft)]">
            <span className="text-[var(--muted)]">E-mail</span>
            <span className="font-mono text-[12.5px]">{profile?.email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 py-2 border-b border-[var(--border-soft)]">
            <span className="text-[var(--muted)]">Plano</span>
            <span>{profile?.isOwner ? "Owner" : "Membro"}</span>
          </div>
          {profile?.memberSince ? (
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-[var(--muted)]">Membro desde</span>
              <span className="font-mono text-[12px] text-[var(--muted-2)]">
                {new Date(profile.memberSince).toLocaleDateString("pt-BR")}
              </span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="self-start inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-[9px] border border-[var(--border)] text-[13px] text-[var(--muted)] hover:text-[var(--danger)] hover:border-[rgba(248,113,113,0.35)] transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sair da conta
        </button>
      </section>

      <section className="p-4 rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--surface)] flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="text-[14px] font-semibold">Alterar senha</h3>
        </div>
        <label className="text-[12px] text-[var(--muted)]">
          Senha atual
          <div className="mt-1">
            <PasswordInput
              value={currentPassword}
              onChange={setCurrentPassword}
              autoComplete="current-password"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px]"
            />
          </div>
        </label>
        <label className="text-[12px] text-[var(--muted)]">
          Nova senha
          <div className="mt-1">
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px]"
            />
          </div>
        </label>
        <label className="text-[12px] text-[var(--muted)]">
          Confirmar nova senha
          <div className="mt-1">
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px]"
            />
          </div>
        </label>
        <button
          type="button"
          onClick={() => void handleChangePassword()}
          disabled={changePassword.isPending}
          className="self-start px-4 py-2 rounded-[9px] border border-[var(--accent)] bg-[var(--accent)] text-[#06201e] text-[13px] font-semibold disabled:opacity-50"
        >
          {changePassword.isPending ? "Salvando…" : "Atualizar senha"}
        </button>
        {pwdMsg ? <p className="text-[12px] text-[var(--muted)]">{pwdMsg}</p> : null}
      </section>

      {profile?.isOwner ? (
        <section className="p-4 rounded-[var(--radius)] border border-[var(--border-soft)] bg-[var(--surface)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[var(--accent)]" />
            <h3 className="text-[14px] font-semibold">SMTP (recuperação de senha)</h3>
          </div>
          <p className="text-[12.5px] text-[var(--muted)]">
            Configuração nativa para envio do link &quot;Esqueci a senha&quot;. Senha
            criptografada no banco e espelhada no <code className="text-[11px]">.env</code>.
          </p>
          <div className="flex flex-wrap gap-2 text-[12px]">
            {smtpStatus?.configured ? (
              <span className="text-emerald-400">SMTP ativo</span>
            ) : (
              <span className="text-amber-400">SMTP não configurado</span>
            )}
            {smtpStatus?.userMasked ? (
              <span className="text-[var(--muted)] font-mono">
                · {smtpStatus.userMasked}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[12px] text-[var(--muted)] sm:col-span-2">
              Host SMTP
              <input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.gmail.com"
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
              />
            </label>
            <label className="text-[12px] text-[var(--muted)]">
              Porta
              <input
                value={smtpPort}
                onChange={(e) => {
                  const next = e.target.value;
                  setSmtpPort(next);
                  const p = Number(next) || 587;
                  if (p === 465) setSmtpSecure(true);
                  if (p === 587) setSmtpSecure(false);
                }}
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
              />
            </label>
            <label className="text-[12px] text-[var(--muted)] flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="rounded"
              />
              TLS direto (só porta 465)
            </label>
            <label className="text-[12px] text-[var(--muted)]">
              Usuário SMTP
              <input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="conta@dominio.com"
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
              />
            </label>
            <label className="text-[12px] text-[var(--muted)]">
              Senha SMTP
              <div className="mt-1">
                <PasswordInput
                  value={smtpPassword}
                  onChange={setSmtpPassword}
                  placeholder={smtpStatus?.configured ? "Deixe vazio para manter" : "••••••••"}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] text-[13px] font-mono"
                />
              </div>
            </label>
            <label className="text-[12px] text-[var(--muted)]">
              Remetente (From)
              <input
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px] font-mono"
              />
            </label>
            <label className="text-[12px] text-[var(--muted)]">
              Nome do remetente
              <input
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                className="mt-1 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-[9px] px-3 py-2 text-[13px]"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSaveSmtp()}
              disabled={saveSmtp.isPending}
              className="px-4 py-2 rounded-[9px] border border-[var(--accent)] text-[var(--accent)] text-[13px] font-semibold disabled:opacity-50"
            >
              {saveSmtp.isPending ? "Salvando…" : "Salvar SMTP"}
            </button>
            <button
              type="button"
              onClick={() => void handleTestSmtp()}
              disabled={testSmtp.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[9px] border border-[var(--border)] text-[13px] hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              {testSmtp.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              Testar envio
            </button>
          </div>
          {smtpMsg ? <p className="text-[12px] text-[var(--muted)]">{smtpMsg}</p> : null}
          {testMsg ? <p className="text-[12px] text-[var(--muted)]">{testMsg}</p> : null}

          <p className="text-[11.5px] text-[var(--muted-2)] flex items-start gap-2">
            <Mail className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
            Gmail: porta 587, checkbox desmarcado (STARTTLS). Use senha de app. Cole valores
            sem aspas — ex.: <code className="text-[11px]">smtp.gmail.com</code>, não{" "}
            <code className="text-[11px]">&quot;smtp.gmail.com&quot;</code>. Link de redefinição
            expira em 1 hora.
          </p>
        </section>
      ) : null}
    </div>
  );
}
