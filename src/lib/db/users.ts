import { prisma } from "./prisma";
import { hashPassword } from "@/lib/auth/password";

const USER_PUBLIC_SELECT = { id: true, email: true, name: true, createdAt: true } as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(email: string, password: string, name?: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.create({
    data: { email: normalizeEmail(email), passwordHash, name },
    select: USER_PUBLIC_SELECT,
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
}

export function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "desc" }, select: USER_PUBLIC_SELECT });
}

export function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
