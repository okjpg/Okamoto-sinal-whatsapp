import { useState, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMe } from "@/lib/api";
import { TimeWindowProvider } from "@/lib/timeWindow";
import { Loader2 } from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import Login from "@/pages/login";
import EsqueciSenha from "@/pages/esqueci-senha";
import RedefinirSenha from "@/pages/redefinir-senha";
import Overview from "@/pages/overview";
import Privado from "@/pages/privado";
import Grupos from "@/pages/grupos";
import Midia from "@/pages/midia";
import Mencoes from "@/pages/mencoes";
import Contatos from "@/pages/contatos";
import Conectores from "@/pages/conectores";
import Configuracoes from "@/pages/configuracoes";
import Perfil from "@/pages/perfil";
import Salvos from "@/pages/salvos";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha"];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, error } = useMe();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    // Logado em /login (ou outra rota pública) → entra no dashboard.
    if (data?.user && PUBLIC_PATHS.includes(location)) {
      setLocation("/");
      return;
    }
    if ((error || !data?.user) && !PUBLIC_PATHS.includes(location)) {
      setLocation("/login");
    }
  }, [isLoading, error, data?.user, location, setLocation]);

  if (PUBLIC_PATHS.includes(location)) {
    if (isLoading) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0A0A0C] text-[#ECECF1]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
      );
    }
    if (data?.user) return null;
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0A0A0C] text-[#ECECF1]">
        <div className="w-12 h-12 rounded-xl bg-[radial-gradient(120%_120%_at_30%_20%,var(--accent),var(--accent-dim))] flex items-center justify-center shadow-[0_0_0_1px_rgba(53,224,216,0.3),0_6px_18px_var(--accent-glow)] mb-6">
          <Loader2 className="w-6 h-6 animate-spin text-[#06201e]" />
        </div>
        <h1 className="font-display font-semibold text-2xl tracking-wide">Sinal</h1>
        <p className="text-sm text-[#8C8C99] mt-2 font-mono">Carregando inteligência...</p>
      </div>
    );
  }

  if (error || !data?.user) {
    return <Login />;
  }

  return <>{children}</>;
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/esqueci-senha" component={EsqueciSenha} />
      <Route path="/redefinir-senha" component={RedefinirSenha} />
    </Switch>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/privado" component={Privado} />
      <Route path="/grupos" component={Grupos} />
      <Route path="/midia" component={Midia} />
      <Route path="/mencoes" component={Mencoes} />
      <Route path="/contatos" component={Contatos} />
      <Route path="/conectores" component={Conectores} />
      <Route path="/configuracoes" component={Configuracoes} />
      <Route path="/perfil" component={Perfil} />
      <Route path="/salvos" component={Salvos} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RootRoutes() {
  const [location] = useLocation();
  if (PUBLIC_PATHS.includes(location)) {
    return <PublicRouter />;
  }
  return (
    <AppShell>
      <AppRouter />
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <TimeWindowProvider>
            <AuthGate>
              <RootRoutes />
            </AuthGate>
          </TimeWindowProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
