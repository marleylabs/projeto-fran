import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "./session";

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
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export function permissionKeysOf(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>): string[] {
  return [
    ...new Set(
      user.roles.flatMap((assignment) => assignment.role.permissions.map((entry) => entry.permission.key))
    ),
  ];
}

export function roleKeysOf(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>): string[] {
  return user.roles.map((assignment) => assignment.role.key);
}

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
