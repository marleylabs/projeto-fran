"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import clsx from "clsx";

export type ShellUser = { email: string; name: string | null; roleLabel: string };

const initials = (value: string) => value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("pt-BR")).join("") || "U";

// Menu do usuário (padrão "menu button"): nome, papel e Sair. Esc fecha e devolve o foco ao botão; clique fora fecha.
// Só oferece o que existe hoje (nome, papel e Sair): não há tela de perfil nem de preferências pessoais.
export function ProfileMenu({ user, onLogout }: { user: ShellUser | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const menuId = `${useId()}-profile-menu`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const display = user?.name?.trim() || user?.email || "";

  useEffect(() => {
    if (!open) return;
    firstItemRef.current?.focus();
    const onPointer = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!user) return <span aria-hidden="true" className="size-9 animate-pulse rounded-full bg-surface-muted motion-reduce:animate-none" />;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Menu do usuário: ${display}`}
        className="flex h-11 cursor-pointer items-center gap-2.5 rounded-control px-1.5 text-left transition-colors hover:bg-surface-muted motion-reduce:transition-none"
      >
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-label font-bold text-primary">{initials(display)}</span>
        <span className="hidden min-w-0 md:block" aria-hidden="true">
          <span className="block max-w-44 truncate text-card-title text-foreground">{display}</span>
          {user.roleLabel && <span className="block max-w-44 truncate text-caption text-foreground-muted">{user.roleLabel}</span>}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={clsx("hidden text-foreground-muted transition-transform md:block motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="Conta" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-card border border-border bg-surface p-1.5 shadow-elevation-md">
          <div className="px-2.5 pb-2.5 pt-2" role="none">
            <p className="truncate text-card-title text-foreground">{display}</p>
            {user.name && <p className="truncate text-caption text-foreground-muted">{user.email}</p>}
            {user.roleLabel && <p className="mt-1.5 inline-flex rounded-full border border-border bg-surface-muted px-2 py-0.5 text-caption font-semibold text-foreground">{user.roleLabel}</p>}
          </div>
          <div className="my-1 h-px bg-border" role="separator" />
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            disabled={leaving}
            onClick={() => { setLeaving(true); onLogout(); }}
            className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-body font-medium text-foreground transition-colors hover:bg-danger-soft hover:text-danger-text focus-visible:bg-danger-soft disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut size={16} aria-hidden="true" />
            {leaving ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}
