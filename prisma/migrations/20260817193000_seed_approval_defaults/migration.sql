INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm_approvals_read', 'approvals.read', 'Consultar solicitações de aprovação'),
  ('perm_approvals_act', 'approvals.act', 'Aprovar, rejeitar ou devolver solicitações'),
  ('perm_approvals_manage', 'approvals.manage', 'Gerenciar políticas e alçadas de aprovação');

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role_admin', 'perm_approvals_read'), ('role_admin', 'perm_approvals_act'), ('role_admin', 'perm_approvals_manage'),
  ('role_requester', 'perm_approvals_read'), ('role_analyst', 'perm_approvals_read'),
  ('role_approver', 'perm_approvals_read'), ('role_approver', 'perm_approvals_act'),
  ('role_finance', 'perm_approvals_read'),
  ('role_controller', 'perm_approvals_read'), ('role_controller', 'perm_approvals_manage');

INSERT INTO "ApprovalPolicy" ("id", "name", "currency", "minAmount", "priority", "active", "createdAt", "updatedAt") VALUES
  ('policy_default_brl', 'Alçada padrão BRL', 'BRL', 0, 1000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('policy_default_usd', 'Alçada padrão USD', 'USD', 0, 1000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "ApprovalPolicyStep" ("id", "policyId", "sequence", "roleId", "name") VALUES
  ('policy_default_brl_step_1', 'policy_default_brl', 1, 'role_approver', 'Aprovação responsável'),
  ('policy_default_usd_step_1', 'policy_default_usd', 1, 'role_approver', 'Aprovação responsável');
