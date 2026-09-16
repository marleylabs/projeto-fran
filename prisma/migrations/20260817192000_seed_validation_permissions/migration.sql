INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm_doc_validation_read', 'document-validation.read', 'Consultar extrações e revisões documentais'),
  ('perm_doc_validation_manage', 'document-validation.manage', 'Validar, rejeitar e corrigir extrações documentais');

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role_admin', 'perm_doc_validation_read'), ('role_admin', 'perm_doc_validation_manage'),
  ('role_requester', 'perm_doc_validation_read'),
  ('role_analyst', 'perm_doc_validation_read'), ('role_analyst', 'perm_doc_validation_manage'),
  ('role_approver', 'perm_doc_validation_read'),
  ('role_finance', 'perm_doc_validation_read'),
  ('role_controller', 'perm_doc_validation_read'), ('role_controller', 'perm_doc_validation_manage');
