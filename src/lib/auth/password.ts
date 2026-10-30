// Hash e verificação de senha com bcrypt. Usado por src/lib/db/users.ts (criação/troca de senha)
// e pela rota de login (/api/auth/login). A senha em texto puro nunca é persistida.
import bcrypt from "bcryptjs";

// Custo do bcrypt (2^12 iterações): equilíbrio entre segurança e tempo de resposta do login.
const SALT_ROUNDS = 12;

/** Gera o hash bcrypt (com salt embutido) da senha informada. Resultado vai em `User.passwordHash`. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/** Compara a senha digitada com o hash salvo; resolve `true` se conferem. Não lança para senha errada. */
export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
