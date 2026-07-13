import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@/lib/api";
import { Loader2, ArrowLeft } from "lucide-react";
import { SinalLogo } from "@/components/SinalLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const forgot = useForgotPassword();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const result = await forgot.mutateAsync({ email: email.trim() });
      setMsg(result.message ?? "Verifique sua caixa de entrada.");
    } catch {
      setMsg("Não foi possível enviar o e-mail. Verifique o SMTP no painel admin.");
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#0A0A0C] flex flex-col items-center justify-center text-[#ECECF1] font-sans p-4">
      <div className="w-full max-w-sm flex flex-col items-center z-10">
        <SinalLogo size={56} className="mb-8" />
        <h1 className="font-display font-semibold text-2xl mb-2">Esqueci a senha</h1>
        <p className="text-[#8C8C99] text-sm mb-8 text-center">
          Enviaremos um link de redefinição se o e-mail estiver cadastrado.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="w-full bg-[#121217] border border-[#1D1D25] rounded-[14px] p-6 shadow-xl"
        >
          <div className="space-y-1.5 mb-6">
            <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#8C8C99]">
              E-mail
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="bg-[#181820] border-[#26262F] h-11"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={forgot.isPending}
            className="w-full h-11 bg-[#35E0D8] hover:bg-[#2bc4bd] text-[#06201e] font-semibold"
          >
            {forgot.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Enviar link"
            )}
          </Button>
          {msg ? (
            <p className="mt-4 text-[12.5px] text-[#8C8C99] leading-relaxed">{msg}</p>
          ) : null}
        </form>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 text-[12.5px] text-[var(--accent)] hover:opacity-80"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
        </Link>
      </div>
    </div>
  );
}
