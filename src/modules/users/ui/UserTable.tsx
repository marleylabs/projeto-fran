"use client";

// Listagem de contas de login. SÓ APRESENTAÇÃO: busca/filtros, menu de ações e diálogos ficam na página (callbacks).
// O perfil é exibido como texto (não é status); o status real da conta usa StatusBadge.
import type { ReactNode } from "react";
import { DataTable, StatusBadge, type DataTableColumn } from "@/components/ui";
import type { UserRow } from "./types";

const formatLastLogin = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Nunca");

export function UserTable({ rows, loading, currentUserId, renderActions }: { rows: UserRow[]; loading: boolean; currentUserId: string | null; renderActions: (user: UserRow) => ReactNode }) {
  const columns: DataTableColumn<UserRow>[] = [
    { id: "name", header: "Nome", rowHeader: true, sticky: "start", width: "15rem", cell: (user) => (
      <span className="flex min-w-0 items-center gap-2"><span className="truncate">{user.name || "Sem nome"}</span>{user.id === currentUserId && <StatusBadge tone="info">Você</StatusBadge>}</span>
    ) },
    { id: "email", header: "E-mail", cell: (user) => <span className="font-mono text-caption">{user.email}</span> },
    { id: "role", header: "Perfil", cell: (user) => user.roles.map((item) => item.role.name).join(", ") || <span className="text-foreground-muted">Sem perfil</span> },
    { id: "status", header: "Status", cell: (user) => (user.active ? <StatusBadge tone="success">Ativo</StatusBadge> : <StatusBadge tone="neutral">Inativo</StatusBadge>) },
    { id: "lastLogin", header: "Último acesso", cell: (user) => <span className="tabular-nums text-foreground-muted">{formatLastLogin(user.lastLoginAt)}</span> },
  ];
  return (
    <DataTable
      caption="Contas de usuário"
      columns={columns}
      rows={rows}
      getRowId={(user) => user.id}
      density="dense"
      minWidth="760px"
      loading={loading && rows.length === 0}
      loadingRows={5}
      rowActions={renderActions}
      actionsLabel="Ações"
      empty={{ title: "Nenhum usuário encontrado", description: "Ajuste a busca ou os filtros." }}
    />
  );
}
