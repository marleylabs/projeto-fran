// Tipos de EXIBIÇÃO da gestão de usuários (contas de login). Sem regra: RBAC, status e senha são decididos no servidor.
// User (conta) e FoodEmployee (colaborador) são domínios distintos; nada aqui os relaciona.
export type Role = { id: string; key: string; name: string; description: string | null };
export type UserRow = { id: string; email: string; name: string | null; active: boolean; lastLoginAt: string | null; createdAt: string; roles: { role: Role }[] };
