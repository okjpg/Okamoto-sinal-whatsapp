import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useLogin } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { SinalLogo } from "@/components/SinalLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/PasswordInput";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: () => setLocation("/") },
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#0A0A0C] flex flex-col items-center justify-center text-[#ECECF1] font-sans p-4 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#35E0D8] rounded-full blur-[120px] opacity-[0.03] pointer-events-none" />
      
      <div className="w-full max-w-sm flex flex-col items-center z-10">
        <SinalLogo size={56} className="mb-8 shadow-[0_12px_32px_rgba(0,0,0,0.45)]" />
        
        <h1 className="font-display font-semibold text-3xl tracking-wide mb-2 text-white">Bem-vindo ao Sinal</h1>
        <p className="text-[#8C8C99] text-sm font-mono mb-8">WhatsApp Intelligence + CRM</p>

        <form onSubmit={handleSubmit} className="w-full bg-[#121217] border border-[#1D1D25] rounded-[14px] p-6 shadow-xl">
          {login.error && (
            <div className="bg-[rgba(248,113,113,0.14)] text-[#F87171] text-[13px] px-4 py-3 rounded-lg mb-6 border border-[rgba(248,113,113,0.2)]">
              {(login.error as Error).message || "Falha ao entrar. Verifique suas credenciais."}
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#8C8C99]">Email</label>
              <Input 
                type="email" 
                name="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="bg-[#181820] border-[#26262F] focus-visible:border-[#35E0D8] focus-visible:ring-1 focus-visible:ring-[#35E0D8] h-11 text-sm placeholder:text-[#5E5E6B]"
                required
              />
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#8C8C99]">Senha</label>
                <Link
                  href="/esqueci-senha"
                  className="text-[11px] text-[#35E0D8] hover:underline"
                >
                  Esqueci a senha
                </Link>
              </div>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                placeholder="••••••••"
                className="bg-[#181820] border-[#26262F] focus-visible:border-[#35E0D8] focus-visible:ring-1 focus-visible:ring-[#35E0D8] h-11 text-sm placeholder:text-[#5E5E6B]"
              />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={login.isPending}
            className="w-full h-11 bg-[#35E0D8] hover:bg-[#2bc4bd] text-[#06201e] font-semibold text-sm transition-all"
          >
            {login.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar no Dashboard"}
          </Button>
        </form>
        
        <p className="mt-8 text-[11px] text-[#5E5E6B] font-mono text-center max-w-[280px]">
          Acesso restrito. Autentique-se para visualizar a inteligência extraída das mensagens.
        </p>
      </div>
    </div>
  );
}
