"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { FileText, LogOut, Users } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Extração", icon: FileText },
  { href: "/usuarios", label: "Usuários", icon: Users },
];

/**
 * Navegação superior compartilhada pelas páginas autenticadas. O sistema tem só duas
 * áreas reais (Extração — que já inclui o histórico — e Usuários), então uma barra
 * de tabs no topo cobre bem o caso; uma sidebar seria peso desnecessário para 2 links.
 */
export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setEmail(me.email))
      .catch(() => setEmail(null));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30">
      <div className="page-container flex items-center justify-between gap-4 py-3">
        <div className="flex items-center gap-6 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight truncate">Extrato Mensal</p>
            <p className="text-[11px] text-text-muted leading-tight hidden sm:block">Extração de folha de pagamento</p>
          </div>

          <nav className="flex items-center gap-1 bg-surface-soft border border-border rounded-lg p-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-ring",
                    active ? "bg-primary text-white" : "text-text-muted hover:text-foreground"
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {email && <span className="text-sm text-text-muted hidden md:inline truncate max-w-40">{email}</span>}
          <button onClick={handleLogout} className="btn btn-ghost btn-sm">
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>
    </header>
  );
}
