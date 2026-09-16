-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId", "roleId")
);

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId", "permissionId")
);

CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stable system roles.
INSERT INTO "Role" ("id", "key", "name", "description") VALUES
  ('role_admin', 'ADMIN', 'Administrador', 'Acesso integral à plataforma'),
  ('role_requester', 'REQUESTER', 'Solicitante', 'Cadastra documentos e consulta seus registros'),
  ('role_analyst', 'ANALYST', 'Analista', 'Revisa, classifica e corrige extrações'),
  ('role_approver', 'APPROVER', 'Aprovador', 'Aprova ou rejeita despesas'),
  ('role_finance', 'FINANCE', 'Financeiro', 'Programa e registra pagamentos e comprovantes'),
  ('role_controller', 'CONTROLLER', 'Controladoria/Contabilidade', 'Concilia, rateia e contabiliza');

INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm_users_read', 'users.read', 'Consultar usuários'),
  ('perm_users_create', 'users.create', 'Criar usuários'),
  ('perm_users_delete', 'users.delete', 'Remover usuários'),
  ('perm_roles_manage', 'roles.manage', 'Gerenciar papéis e permissões'),
  ('perm_accounting_read', 'accounting.read', 'Consultar importações contábeis'),
  ('perm_accounting_upload', 'accounting.upload', 'Enviar e processar relatórios de folha');

-- Administrators receive every permission, including permissions added above.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT 'role_admin', "id" FROM "Permission";

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role_requester', 'perm_accounting_read'),
  ('role_requester', 'perm_accounting_upload'),
  ('role_analyst', 'perm_accounting_read'),
  ('role_analyst', 'perm_accounting_upload'),
  ('role_controller', 'perm_accounting_read');

-- Preserve access: every account that existed before RBAC becomes ADMIN.
INSERT INTO "UserRole" ("userId", "roleId")
SELECT "id", 'role_admin' FROM "User";
