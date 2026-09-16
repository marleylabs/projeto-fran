import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "./prisma";

export const USER_PUBLIC_SELECT = {
  id: true, email: true, name: true, active: true, lastLoginAt: true, createdAt: true,
  roles: { select: { role: { select: { id: true, key: true, name: true } } } },
} as const;

export class UserAccessError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const resetHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createUser(email: string, password: string, name?: string, roleKey = "REQUESTER") {
  const passwordHash = await hashPassword(password);
  return prisma.user.create({ data: { email: normalizeEmail(email), passwordHash, name, roles: { create: { role: { connect: { key: roleKey } } } } }, select: USER_PUBLIC_SELECT });
}

export function findUserByEmail(email: string) { return prisma.user.findUnique({ where: { email: normalizeEmail(email) } }); }
export function listUsers() { return prisma.user.findMany({ orderBy: [{ name: "asc" }, { email: "asc" }], select: USER_PUBLIC_SELECT }); }
export function listRoles() { return prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, key: true, name: true, description: true } }); }

export async function updateUserAccess(input: { actorId: string; targetUserId: string; name?: string; roleKey?: string; active?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.targetUserId }, include: { roles: { include: { role: true } } } });
    if (!target) throw new UserAccessError("Usuário não encontrado.", 404);
    const previousRole = target.roles[0]?.role.key ?? null;
    const nextRole = input.roleKey ?? previousRole;
    const nextActive = input.active ?? target.active;
    if (!nextRole || !(await tx.role.findUnique({ where: { key: nextRole } }))) throw new UserAccessError("Perfil inválido.");
    const removesAdmin = previousRole === "ADMIN" && (nextRole !== "ADMIN" || !nextActive);
    if (removesAdmin) {
      const activeAdmins = await tx.user.count({ where: { active: true, roles: { some: { role: { key: "ADMIN" } } } } });
      if (activeAdmins <= 1) throw new UserAccessError("Não é possível alterar este usuário porque ele é o último Administrador ativo da plataforma.", 409);
    }
    if (input.actorId === target.id && (nextRole !== "ADMIN" || !nextActive)) throw new UserAccessError("Você não pode remover o próprio acesso administrativo ou desativar a própria conta.", 409);
    const roleChanged = previousRole !== nextRole || target.roles.length !== 1;
    const statusChanged = target.active !== nextActive;
    if (roleChanged) {
      const role = await tx.role.findUniqueOrThrow({ where: { key: nextRole } });
      await tx.userRole.deleteMany({ where: { userId: target.id } });
      await tx.userRole.create({ data: { userId: target.id, roleId: role.id } });
    }
    const user = await tx.user.update({ where: { id: target.id }, data: { name: input.name === undefined ? target.name : input.name.trim() || null, active: nextActive }, select: USER_PUBLIC_SELECT });
    if (roleChanged || statusChanged) await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.userAccessAudit.create({ data: { actorId: input.actorId, targetUserId: target.id, action: roleChanged ? "ROLE_UPDATED" : statusChanged ? "STATUS_UPDATED" : "USER_UPDATED", details: { previousRole, nextRole, previousActive: target.active, nextActive } satisfies Prisma.InputJsonValue } });
    return user;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createPasswordReset(actorId: string, targetUserId: string) {
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const user = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, name: true, active: true } });
    if (!target) throw new UserAccessError("Usuário não encontrado.", 404);
    if (!target.active) throw new UserAccessError("Reative o usuário antes de enviar a redefinição de senha.", 409);
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } });
    const resetRecord = await tx.passwordResetToken.create({ data: { userId: target.id, tokenHash: resetHash(token), expiresAt }, select: { id: true } });
    return { ...target, resetTokenId: resetRecord.id };
  });
  return { token, expiresAt, user };
}

export async function setTemporaryPassword(actorId: string, targetUserId: string, password: string) {
  if (password.length < 8) throw new UserAccessError("A senha temporária deve possuir pelo menos 8 caracteres.");
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, active: true } });
    if (!target) throw new UserAccessError("Usuário não encontrado.", 404);
    if (!target.active) throw new UserAccessError("Reative o usuário antes de redefinir sua senha.", 409);
    await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: target.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } });
    await tx.userAccessAudit.create({ data: { actorId, targetUserId: target.id, action: "TEMPORARY_PASSWORD_SET" } });
    return { ok: true };
  });
}

export async function consumePasswordReset(token: string, password: string) {
  if (password.length < 8) throw new UserAccessError("A nova senha deve possuir pelo menos 8 caracteres.");
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.findUnique({ where: { tokenHash: resetHash(token) } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) throw new UserAccessError("Este link de redefinição é inválido ou expirou.");
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    return { ok: true };
  });
}
