// Tipos de EXIBIÇÃO da gestão de usuários (contas de login). Sem regra: RBAC, status e senha são decididos no servidor.
// User (conta) e FoodEmployee (colaborador) são domínios distintos; nada aqui os relaciona.
// Perfil (papel RBAC) como devolvido pela API.
export type Role = { id: string; key: string; name: string; description: string | null };
// Conta de login como listada pela API (datas em ISO; sem dados de credencial).
export type UserRow = { id: string; email: string; name: string | null; active: boolean; lastLoginAt: string | null; createdAt: string; roles: { role: Role }[] };
