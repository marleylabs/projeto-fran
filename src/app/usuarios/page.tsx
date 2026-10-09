"use client";

// Administração → Usuários (contas de login). Fase 7J: apresentação no Design System (PageHeader, FilterBar/SearchInput,
// DataTable, Dialog com Field, Switch). RBAC, status, proteção do último Administrador e senhas continuam no SERVIDOR;
// a tela só envia os mesmos payloads de antes (criar, PATCH nome/perfil/ativo, redefinição por e-mail ou temporária).
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { Button, Dialog, FeedbackAlert, Field, FilterBar, FloatingActionMenu, PageHeader, SearchInput, Switch, TextInput, textInputClassName, useToast } from "@/components/ui";
import { UserTable } from "@/modules/users/ui/UserTable";
import type { Role, UserRow } from "@/modules/users/ui/types";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const menuItem = "block w-full cursor-pointer rounded-control px-3 py-2 text-left text-body hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";
async function request(url: string, init?: RequestInit) { const response = await fetch(url, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir a operação."); return body; }

export default function UsuariosPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]), [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [query, setQuery] = useState(""), [roleFilter, setRoleFilter] = useState(""), [statusFilter, setStatusFilter] = useState("active");
  const [openMenu, setOpenMenu] = useState<string | null>(null), [editing, setEditing] = useState<UserRow | null>(null), [resetting, setResetting] = useState<UserRow | null>(null);
  const [editName, setEditName] = useState(""), [editRole, setEditRole] = useState(""), [editActive, setEditActive] = useState(true);
  const [tempPassword, setTempPassword] = useState(""), [tempConfirmation, setTempConfirmation] = useState("");
  const [recoveryEmailConfigured, setRecoveryEmailConfigured] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false), [email, setEmail] = useState(""), [name, setName] = useState(""), [password, setPassword] = useState(""), [newRole, setNewRole] = useState("REQUESTER");

  async function load() { const body = await request("/api/users"); setUsers(body.users ?? []); setRoles(body.roles ?? []); setRecoveryEmailConfigured(Boolean(body.recoveryEmailConfigured)); }
  useEffect(() => {
    void request("/api/users").then((body) => { setUsers(body.users ?? []); setRoles(body.roles ?? []); setRecoveryEmailConfigured(Boolean(body.recoveryEmailConfigured)); setLoadError(null); })
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : "Não foi possível carregar os usuários.")).finally(() => setLoading(false));
    void fetch("/api/auth/me").then((r) => r.json()).then((me) => { setCurrentUserId(me.id); }).catch(() => {});
  }, []);
  const filtered = useMemo(() => users.filter((user) => (!query || normalize(`${user.name ?? ""} ${user.email}`).includes(normalize(query))) && (!roleFilter || user.roles.some((item) => item.role.key === roleFilter)) && (statusFilter === "all" || user.active === (statusFilter === "active"))), [users, query, roleFilter, statusFilter]);
  const closeDialogs = () => { setEditing(null); setResetting(null); setError(null); setTempPassword(""); setTempConfirmation(""); };
  function openEdit(user: UserRow) { setOpenMenu(null); setEditing(user); setEditName(user.name ?? ""); setEditRole(user.roles[0]?.role.key ?? ""); setEditActive(user.active); setError(null); }

  async function create(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await request("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, name, password, roleKey: newRole }) }); toast.success("Usuário criado com sucesso."); setCreateOpen(false); setEmail(""); setName(""); setPassword(""); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível criar o usuário."); } finally { setBusy(false); } }
  async function saveEdit() { if (!editing) return; setBusy(true); setError(null); try { const body = await request(`/api/users/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, roleKey: editRole, active: editActive }) }); setUsers((current) => current.map((item) => (item.id === editing.id ? body.user : item))); toast.success(`Acesso de ${body.user.name || body.user.email} atualizado.`); closeDialogs(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível alterar o usuário."); } finally { setBusy(false); } }
  async function sendReset() { if (!resetting) return; setBusy(true); setError(null); try { await request(`/api/users/${resetting.id}/password-reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "email" }) }); toast.success(`Link de redefinição enviado para ${resetting.email}.`); closeDialogs(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível enviar a redefinição."); } finally { setBusy(false); } }
  async function setTemporary() { if (!resetting) return; setBusy(true); setError(null); try { await request(`/api/users/${resetting.id}/password-reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy: "temporary", password: tempPassword, confirmation: tempConfirmation }) }); toast.success(`Senha temporária de ${resetting.name || resetting.email} atualizada.`); closeDialogs(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível redefinir a senha."); } finally { setBusy(false); } }

  const activeFilters = [query.trim(), roleFilter, statusFilter !== "active" ? statusFilter : ""].filter(Boolean).length;
  const confirmationMismatch = tempConfirmation.length > 0 && tempPassword !== tempConfirmation;
  const roleOptions = roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>);

  return <div className="flex flex-1 flex-col">
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-8 sm:px-6">
      <PageHeader eyebrow="Administração / Acessos" title="Usuários" description="Perfis, status e segurança das contas de login." actions={<Button aura onClick={() => { setCreateOpen(true); setError(null); }}><Plus size={16} aria-hidden="true" />Novo usuário</Button>} />
      {loadError && <FeedbackAlert status="error">{loadError}</FeedbackAlert>}
      <FilterBar
        label="Filtros de usuários"
        search={<SearchInput label="Pesquisar usuários" placeholder="Buscar por nome ou e-mail" value={query} onValueChange={setQuery} />}
        activeCount={activeFilters}
        onClear={() => { setQuery(""); setRoleFilter(""); setStatusFilter("active"); }}
      >
        <select aria-label="Filtrar perfil" className={textInputClassName} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">Todos os perfis</option>{roleOptions}</select>
        <select aria-label="Filtrar status" className={textInputClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
      </FilterBar>
      <p className="text-body text-foreground-muted tabular-nums" role="status">{loading ? "Carregando usuários..." : `${filtered.length} de ${users.length} usuário(s)`}</p>
      <UserTable rows={filtered} loading={loading} currentUserId={currentUserId} renderActions={(user) => (
        <FloatingActionMenu open={openMenu === user.id} onOpenChange={(open) => setOpenMenu(open ? user.id : null)} label={`Ações de ${user.name || user.email}`}>
          <button role="menuitem" className={menuItem} onClick={() => openEdit(user)}>Editar usuário</button>
          <button role="menuitem" className={menuItem} onClick={() => { setOpenMenu(null); setResetting(user); setError(null); }} disabled={!user.active}>Redefinir senha</button>
          {user.id !== currentUserId && <button role="menuitem" className={user.active ? `${menuItem} text-danger-text hover:bg-danger-soft` : `${menuItem} text-success-text hover:bg-success-soft`} onClick={() => { openEdit(user); setEditActive(!user.active); }}>{user.active ? "Desativar acesso" : "Reativar acesso"}</button>}
        </FloatingActionMenu>
      )} />
    </main>

    <Dialog
      open={createOpen}
      onClose={() => { if (!busy) setCreateOpen(false); }}
      dismissible={!busy}
      title="Novo usuário"
      description="O perfil define as permissões da conta; o servidor valida e audita a criação."
      footer={<><Button variant="secondary" type="button" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</Button><Button type="submit" form="user-create-form" aura loading={busy}>{busy ? "Criando..." : "Criar usuário"}</Button></>}
    >
      <form id="user-create-form" onSubmit={create} className="grid gap-3">
        <Field label="Nome">{(control) => <TextInput {...control} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />}</Field>
        <Field label="E-mail" required>{(control) => <TextInput {...control} type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />}</Field>
        <Field label="Perfil" required>{(control) => <select {...control} required className={textInputClassName} value={newRole} onChange={(event) => setNewRole(event.target.value)}>{roleOptions}</select>}</Field>
        <Field label="Senha inicial" required helper="Mínimo de 8 caracteres.">{(control) => <TextInput {...control} type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />}</Field>
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
      </form>
    </Dialog>

    <Dialog
      open={Boolean(editing)}
      onClose={() => { if (!busy) closeDialogs(); }}
      dismissible={!busy}
      title="Gerenciar usuário"
      description={editing?.email}
      footer={<><Button variant="secondary" onClick={closeDialogs} disabled={busy}>Cancelar</Button><Button aura onClick={saveEdit} loading={busy}>{busy ? "Salvando..." : "Salvar alterações"}</Button></>}
    >
      {editing && <div className="grid gap-4">
        <Field label="Nome">{(control) => <TextInput {...control} value={editName} onChange={(event) => setEditName(event.target.value)} />}</Field>
        <Field label="E-mail" helper="O e-mail de login não é alterado por aqui.">{(control) => <TextInput {...control} readOnly className="font-mono text-caption" value={editing.email} />}</Field>
        <Field label="Perfil" required>{(control) => <select {...control} className={textInputClassName} value={editRole} onChange={(event) => setEditRole(event.target.value)}>{roleOptions}</select>}</Field>
        <Switch checked={editActive} disabled={editing.id === currentUserId} onCheckedChange={setEditActive} label="Acesso ativo" description={editing.id === currentUserId ? "Você não pode desativar a própria conta." : "Contas inativas não podem autenticar."} />
        {editRole === "ADMIN" && editing.roles[0]?.role.key !== "ADMIN" && <FeedbackAlert status="warning" title="Elevação de privilégio">Este usuário receberá acesso administrativo integral.</FeedbackAlert>}
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
      </div>}
    </Dialog>

    <Dialog
      open={Boolean(resetting)}
      onClose={() => { if (!busy) closeDialogs(); }}
      dismissible={!busy}
      title="Redefinir senha"
      description={resetting ? `${resetting.name || "Sem nome"} · ${resetting.email}` : undefined}
      footer={<Button variant="secondary" onClick={closeDialogs} disabled={busy}>Fechar</Button>}
    >
      {resetting && <div className="grid gap-5">
        <section className="grid gap-2" aria-labelledby="reset-email-title">
          <h3 id="reset-email-title" className="text-card-title">Enviar link seguro</h3>
          <p className="text-caption text-foreground-muted">O usuário receberá um link de uso único, válido por uma hora.</p>
          {!recoveryEmailConfigured && <FeedbackAlert status="warning">Envio indisponível: configure as variáveis SMTP no servidor.</FeedbackAlert>}
          <Button size="sm" className="w-fit" onClick={sendReset} loading={busy} disabled={!recoveryEmailConfigured}>{busy ? "Enviando..." : "Enviar redefinição por e-mail"}</Button>
        </section>
        <div className="flex items-center gap-3 text-caption text-foreground-muted" aria-hidden="true"><span className="h-px flex-1 bg-border" />ou<span className="h-px flex-1 bg-border" /></div>
        <section className="grid gap-3" aria-labelledby="reset-temporary-title">
          <h3 id="reset-temporary-title" className="text-card-title">Definir senha temporária</h3>
          <Field label="Nova senha temporária" helper="Mínimo de 8 caracteres.">{(control) => <TextInput {...control} type="password" minLength={8} autoComplete="new-password" value={tempPassword} onChange={(event) => setTempPassword(event.target.value)} />}</Field>
          <Field label="Confirmar senha" error={confirmationMismatch ? "As senhas não conferem." : undefined}>{(control) => <TextInput {...control} type="password" minLength={8} autoComplete="new-password" value={tempConfirmation} onChange={(event) => setTempConfirmation(event.target.value)} />}</Field>
          <Button size="sm" variant="secondary" className="w-fit" onClick={setTemporary} loading={busy} disabled={tempPassword.length < 8 || tempPassword !== tempConfirmation}><KeyRound size={14} aria-hidden="true" />{busy ? "Atualizando..." : "Atualizar senha"}</Button>
        </section>
        {error && <FeedbackAlert status="error">{error}</FeedbackAlert>}
      </div>}
    </Dialog>
  </div>;
}
