-- Additive grants mirror ROLE_PERMISSIONS and are safe to apply again.
BEGIN;
INSERT INTO "Permission" (id, name, description)
SELECT gen_random_uuid(), v.name, v.description FROM (VALUES
  ('jobcard:remarks:update', 'Edit job and estimate remarks in any status with an audit trail'),
  ('jobcard:picking-list:print', 'Print internal estimate parts picking data without stock movement')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p.name = v.name);
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM (VALUES
  ('SuperAdmin', 'jobcard:remarks:update'),
  ('SuperAdmin', 'jobcard:picking-list:print'),
  ('Admin', 'jobcard:remarks:update'),
  ('Admin', 'jobcard:picking-list:print'),
  ('GeneralStoreManager', 'jobcard:picking-list:print'),
  ('StoreOfficer', 'jobcard:picking-list:print'),
  ('WorkshopManager', 'jobcard:remarks:update'),
  ('WorkshopManager', 'jobcard:picking-list:print'),
  ('ServiceAdviser', 'jobcard:remarks:update'),
  ('ServiceAdviser', 'jobcard:picking-list:print'),
  ('ServiceManager', 'jobcard:remarks:update'),
  ('ServiceManager', 'jobcard:picking-list:print')
) AS grants(role_name, permission_name)
JOIN "Role" r ON r.name = grants.role_name
JOIN "Permission" p ON p.name = grants.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
COMMIT;
