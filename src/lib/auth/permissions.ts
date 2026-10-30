import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "./session";

// RBAC: usuário → perfis (Role) → permissões (Permission.key). As chaves abaixo precisam existir na
// tabela Permission (seed do Prisma). Toda rota de API protegida chama `requirePermission` no início;
// a UI usa `permissionKeysOf`/`roleKeysOf` (via /api/auth/me) só para esconder botões — a checagem
// que vale é sempre a do backend.

/** Catálogo das chaves de permissão aceitas por `requirePermission`. */
export const PERMISSIONS = {
  USERS_READ: "users.read",
  USERS_CREATE: "users.create",
  USERS_DELETE: "users.delete",
  ROLES_MANAGE: "roles.manage",
  ACCOUNTING_READ: "accounting.read",
  ACCOUNTING_UPLOAD: "accounting.upload",
  MASTER_DATA_READ: "master-data.read",
  MASTER_DATA_MANAGE: "master-data.manage",
  FINANCIAL_RECORDS_READ: "financial-records.read",
  FINANCIAL_RECORDS_CREATE: "financial-records.create",
  FINANCIAL_RECORDS_UPDATE: "financial-records.update",
  FINANCIAL_RECORDS_DELETE: "financial-records.delete",
  DOCUMENT_VALIDATION_READ: "document-validation.read",
  DOCUMENT_VALIDATION_MANAGE: "document-validation.manage",
  TRAINING_READ: "training.read",
  TRAINING_MANAGE: "training.manage",
} as const;

/** União literal das chaves de `PERMISSIONS` (ex.: "users.read"). */
export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Chaves de permissão efetivas do usuário (união sem repetição de todos os seus perfis). */
export function permissionKeysOf(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>): string[] {
  return [
    ...new Set(
      user.roles.flatMap((assignment) => assignment.role.permissions.map((entry) => entry.permission.key))
    ),
  ];
}

/** Chaves dos perfis do usuário (ex.: "ADMIN", "REQUESTER"). */
export function roleKeysOf(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>): string[] {
  return user.roles.map((assignment) => assignment.role.key);
}

/**
 * Guarda de rota: resolve o usuário da sessão e confere a permissão.
 * Retorna `{ user, response: null }` se autorizado; senão `{ user: null, response }` com JSON
 * `{ error }` e status 401 (sem sessão válida) ou 403 (sem a permissão). Uso típico:
 * `const { user, response } = await requirePermission(...); if (response) return response;`
 */
export async function requirePermission(permission: PermissionKey) {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    } as const;
  }

  if (!permissionKeysOf(user).includes(permission)) {
    return {
      user: null,
      response: NextResponse.json({ error: "Você não possui permissão para esta operação." }, { status: 403 }),
    } as const;
  }

  return { user, response: null } as const;
}
