"use client";

import { useEffect, useState } from "react";
import { Trash2, UserPlus, Users } from "lucide-react";
import { AppHeader } from "@/components/ui/AppHeader";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function initials(nameOrEmail: string) {
  const base = nameOrEmail.trim();
  return base.slice(0, 2).toUpperCase();
}

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadUsers = () => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setUsers(json.users ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    loadUsers();
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((me) => setCurrentUserId(me.id))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined, password }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Não foi possível criar o usuário.");
        return;
      }

      setEmail("");
      setName("");
      setPassword("");
      loadUsers();
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) loadUsers();
  };

  return (
    <div className="flex-1 flex flex-col">
      <AppHeader />

      <main className="flex-1 page-container py-6 sm:py-8 flex flex-col gap-6">
        <PageHeader title="Usuários" description="Gerencie quem pode acessar o sistema." backHref="/" backLabel="Extração" />

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Novo usuário</h2>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input w-full"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Nome (opcional)</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="field-input w-full" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="field-label">Senha (mín. 8 caracteres)</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field-input w-full"
              />
            </label>
            <div className="sm:col-span-3 flex items-center justify-between gap-3">
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={saving} className="btn btn-primary ml-auto">
                <UserPlus className="w-4 h-4" strokeWidth={1.75} />
                {saving ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </form>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              {users.length} usuário(s) cadastrado(s)
            </h2>
          </div>

          {users.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum usuário cadastrado" />
          ) : (
            <>
              {/* Desktop: tabela */}
              <table className="w-full text-sm border-collapse hidden sm:table">
                <thead>
                  <tr className="bg-surface-soft border-b border-border">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase">Usuário</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-text-muted uppercase">Criado em</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-soft">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                            {initials(u.name || u.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{u.name || u.email}</p>
                            {u.name && <p className="text-xs text-text-muted truncate">{u.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-text-muted whitespace-nowrap">{formatDate(u.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        {u.id !== currentUserId && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="btn btn-ghost btn-sm !text-danger hover:!bg-danger-soft"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Remover
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: cards */}
              <ul className="sm:hidden divide-y divide-border">
                {users.map((u) => (
                  <li key={u.id} className="p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary-soft text-primary text-xs font-semibold flex items-center justify-center shrink-0">
                      {initials(u.name || u.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{u.name || u.email}</p>
                      {u.name && <p className="text-xs text-text-muted truncate">{u.email}</p>}
                      <p className="text-xs text-text-subtle mt-0.5">Criado em {formatDate(u.createdAt)}</p>
                    </div>
                    {u.id !== currentUserId && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="btn btn-ghost btn-sm !p-2 !text-danger shrink-0"
                        aria-label="Remover usuário"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
