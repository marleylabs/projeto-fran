INSERT INTO "Permission" ("id", "key", "description") VALUES
  ('perm_fin_records_read', 'financial-records.read', 'Consultar registros financeiros'),
  ('perm_fin_records_create', 'financial-records.create', 'Criar registros financeiros'),
  ('perm_fin_records_update', 'financial-records.update', 'Alterar registros financeiros');

INSERT INTO "RolePermission" ("roleId", "permissionId") VALUES
  ('role_admin', 'perm_fin_records_read'), ('role_admin', 'perm_fin_records_create'), ('role_admin', 'perm_fin_records_update'),
  ('role_requester', 'perm_fin_records_read'), ('role_requester', 'perm_fin_records_create'),
  ('role_analyst', 'perm_fin_records_read'), ('role_analyst', 'perm_fin_records_create'), ('role_analyst', 'perm_fin_records_update'),
  ('role_approver', 'perm_fin_records_read'),
  ('role_finance', 'perm_fin_records_read'), ('role_finance', 'perm_fin_records_update'),
  ('role_controller', 'perm_fin_records_read');
