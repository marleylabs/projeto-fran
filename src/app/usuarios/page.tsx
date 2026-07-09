"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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
      <header className="bg-surface border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-primary">Usuários</h1>
            <p className="text-xs text-text-muted">Gerenciar quem pode acessar o sistema</p>
          </div>
          <Link href="/" className="text-sm font-medium text-text-muted hover:text-primary">
            Voltar
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">Novo usuário</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-text-muted">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-text-muted">Nome (opcional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-text-muted">Senha (mín. 8 caracteres)</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-md border border-border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              />
            </label>
            <div className="sm:col-span-3 flex items-center justify-between gap-3">
              {error && <p className="text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={saving}
                className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </form>
        </div>

        <div className="card overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase">Criado em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5">{u.name || "—"}</td>
                  <td className="px-4 py-2.5">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {u.id !== currentUserId && (
                      <button onClick={() => handleDelete(u.id)} className="text-sm font-medium text-red-700 hover:text-red-900">
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
