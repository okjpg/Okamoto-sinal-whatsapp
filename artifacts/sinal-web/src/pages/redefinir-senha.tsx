import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useResetPassword } from "@/lib/api";
import { Loader2, Activity, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";

export default function RedefinirSenha() {
  const [, setLocation] = useLocation();
  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token")?.trim() ?? "";
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const reset = useResetPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 8) {
      setMsg("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg("As senhas não coincidem.");
      return;
    }
    if (!token) {
      setMsg("Link inválido — solicite um novo e-mail.");
      return;
    }
    try {
      await reset.mutateAsync({ token, newPassword, confirmPassword });
      setMsg("Senha atualizada. Redirecionando…");
      setTimeout(() => setLocation("/login"), 1500);
    } catch (e) {
      const err = e as { data?: { error?: string } };
      const code = err.data?.error;
      if (code === "invalid_or_expired_token") {
        setMsg("Link expirado ou inválido. Solicite um novo.");
      } else if (code === "password_mismatch") {
        setMsg("As senhas não coincidem.");
      } else {
        setMsg("Não foi possível redefinir a senha.");
      }
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0A0A0C] flex flex-col items-center justify-center text-[#ECECF1] font-sans p-4">
      <div className="w-full max-w-sm flex flex-col items-center z-10">
        <div className="w-14 h-14 rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,var(--accent),var(--accent-dim))] flex items-center justify-center mb-8">
          <Activity className="w-7 h-7 text-[#06201e]" />
        </div>
        <h1 className="font-display font-semibold text-2xl mb-2">Nova senha</h1>
        <p className="text-[#8C8C99] text-sm mb-8 text-center">
          Escolha uma senha com pelo menos 8 caracteres.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="w-full bg-[#121217] border border-[#1D1D25] rounded-[14px] p-6 shadow-xl space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#8C8C99]">
              Nova senha
            </label>
            <PasswordInput
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              className="bg-[#181820] border-[#26262F] h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#8C8C99]">
              Confirmar senha
            </label>
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              className="bg-[#181820] border-[#26262F] h-11"
            />
          </div>
          <Button
            type="submit"
            disabled={reset.isPending || !token}
            className="w-full h-11 bg-[#35E0D8] hover:bg-[#2bc4bd] text-[#06201e] font-semibold"
          >
            {reset.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Salvar nova senha"
            )}
          </Button>
          {msg ? (
            <p className="text-[12.5px] text-[#8C8C99] leading-relaxed">{msg}</p>
          ) : null}
        </form>

        <Link
          href="/esqueci-senha"
          className="mt-6 inline-flex items-center gap-2 text-[12.5px] text-[var(--accent)] hover:opacity-80"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Solicitar novo link
        </Link>
      </div>
    </div>
  );
}
