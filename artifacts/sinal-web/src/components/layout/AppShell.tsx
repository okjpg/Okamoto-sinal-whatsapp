import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useMe } from "@/lib/api";
import { useTimeWindow, TIME_WINDOWS } from "@/lib/timeWindow";
import CommandPalette from "@/components/CommandPalette";
import RefreshControl from "@/components/RefreshControl";
import NotificationBell from "@/components/NotificationBell";
import { NotificationProvider } from "@/hooks/use-notifications";
import { SinalLogo } from "@/components/SinalLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, ChevronDown, Check } from "lucide-react";

const navItems = [
  { href: "/", label: "Overview", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  ) },
  { href: "/privado", label: "Privado", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) },
  { href: "/grupos", label: "Grupos", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.6M17 19a5.2 5.2 0 0 0-3-4.7" strokeLinecap="round"/></svg>
  ) },
  { href: "/midia", label: "Mídia", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 2v20M17 2v20M2 12h22M2 7h5M2 17h5M17 17h5M17 7h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) },
  { href: "/mencoes", label: "Menções", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11a9 9 0 0 1 18 0c0 5-4 6-4 6l-1 3-3-2a9 9 0 0 1-10-7Z" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 11h.01M12 11h.01M16 11h.01" strokeLinecap="round"/></svg>
  ) },
];

const relItems = [
  { href: "/contatos", label: "Contatos", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9" strokeLinecap="round"/></svg>
  ) },
  { href: "/salvos", label: "Salvos & Tasks", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.5 6h13l3.5 6v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) },
  { href: "/conectores", label: "Conectores", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 7 4.5 11.5a4.95 4.95 0 0 0 7 7L16 14M15 17l4.5-4.5a4.95 4.95 0 0 0-7-7L8 10" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) },
  { href: "/configuracoes", label: "IA", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" strokeLinecap="round"/><circle cx="12" cy="12" r="4"/></svg>
  ) }
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: me } = useMe();
  const { days, setDays, option } = useTimeWindow();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <NotificationProvider>
    <div className="grid grid-cols-[236px_1fr] h-screen bg-[var(--bg)] text-[var(--text)] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="bg-[var(--surface)] border-r border-[var(--border-soft)] flex flex-col p-[18px_14px] gap-[4px] h-screen">
        <div className="flex items-center gap-[10px] p-[6px_8px_18px]">
          <SinalLogo size={32} className="shadow-[0_6px_18px_rgba(0,0,0,0.35)]" />
          <div>
            <div className="font-display font-bold text-[19px] tracking-[0.01em] leading-none">Sinal</div>
            <div className="text-[10.5px] text-[var(--muted-2)] tracking-[0.05em] mt-[2px]">sinal &gt; ruído</div>
          </div>
        </div>

        <div className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted-2)] p-[14px_10px_6px]">Inteligência</div>
        
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-[11px] p-[8px_10px] rounded-[var(--radius-sm)] text-[13.5px] font-medium transition-[0.16s] relative select-none cursor-pointer ${
                isActive ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {isActive && (
                <div className="absolute left-[-14px] top-[8px] bottom-[8px] w-[3px] rounded-r-[3px] bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
              )}
              <div className="w-[17px] h-[17px] opacity-85 shrink-0 [&>svg]:w-full [&>svg]:h-full">{item.icon}</div>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted-2)] p-[14px_10px_6px]">Relacionamento</div>

        {relItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`flex items-center gap-[11px] p-[8px_10px] rounded-[var(--radius-sm)] text-[13.5px] font-medium transition-[0.16s] relative select-none cursor-pointer ${
                isActive ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              }`}
            >
              {isActive && (
                <div className="absolute left-[-14px] top-[8px] bottom-[8px] w-[3px] rounded-r-[3px] bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
              )}
              <div className="w-[17px] h-[17px] opacity-85 shrink-0 [&>svg]:w-full [&>svg]:h-full">{item.icon}</div>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="mt-auto flex flex-col gap-[8px]">
          <Link
            href="/perfil"
            className={`flex items-center gap-[10px] p-[9px_10px] border rounded-[var(--radius-sm)] bg-[var(--surface-2)] cursor-pointer transition-[0.16s] ${
              location === "/perfil"
                ? "border-[var(--accent-dim)]"
                : "border-[var(--border)] hover:border-[var(--accent-dim)]"
            }`}
          >
            <div className="w-[26px] h-[26px] rounded-[7px] bg-gradient-to-br from-[#3a3a48] to-[#23232c] flex items-center justify-center font-bold text-[12px] text-[var(--accent)]">
              {me?.user?.email?.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold leading-[1.2] truncate">{me?.user?.email || "Conta"}</div>
              <div className="text-[10.5px] text-[var(--muted-2)]">
                {me?.user?.isOwner ? "Perfil · Owner" : "Perfil · conta"}
              </div>
            </div>
            <svg className="ml-auto text-[var(--muted-2)]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="h-screen overflow-y-auto relative flex flex-col">
        <div className="sticky top-0 z-20 backdrop-blur-[12px] bg-[rgba(10,10,12,0.72)] border-b border-[var(--border-soft)] flex items-center gap-[16px] p-[14px_26px]">
          <h1 className="font-display font-semibold text-[21px] tracking-[0.005em]">
            {[...navItems, ...relItems, { href: "/perfil", label: "Perfil" }].find(i => i.href === location)?.label || "Sinal"}
          </h1>
          <div className="flex items-center gap-[8px] text-[var(--muted)] text-[13.5px]"></div>
          <div className="flex-1"></div>

          <RefreshControl />

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-[8px] bg-[var(--surface-2)] border border-[var(--border)] p-[7px_12px] rounded-[var(--radius-sm)] w-[220px] text-[var(--muted-2)] hover:border-[var(--accent-dim)] transition-colors cursor-text"
          >
            <Search className="w-[15px] h-[15px]" />
            <span className="text-[13px] flex-1 text-left">Buscar…</span>
            <kbd className="font-mono text-[10.5px] text-[var(--muted-2)] bg-[var(--surface-3)] border border-[var(--border)] rounded-[5px] px-[5px] py-[1px]">⌘K</kbd>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-[7px] bg-[var(--surface-2)] border border-[var(--border)] p-[7px_12px] rounded-[var(--radius-sm)] text-[12.5px] text-[var(--muted)] cursor-pointer hover:border-[var(--accent-dim)] transition-colors outline-none"
              >
                {option.label}
                <ChevronDown className="w-[14px] h-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[170px]">
              {TIME_WINDOWS.map((w) => (
                <DropdownMenuItem
                  key={w.days}
                  onSelect={() => setDays(w.days)}
                  className="text-[13px] flex items-center gap-2"
                >
                  <Check
                    className={`w-3.5 h-3.5 ${days === w.days ? "opacity-100 text-[var(--accent)]" : "opacity-0"}`}
                  />
                  {w.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <NotificationBell />
        </div>

        <div className="p-[24px_26px_60px] animate-in fade-in slide-in-from-bottom-2 duration-300">
          {children}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
    </NotificationProvider>
  );
}
