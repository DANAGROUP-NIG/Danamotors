-- Backfill estimate revision grants to match ROLE_PERMISSIONS.
BEGIN;
INSERT INTO "Permission" (id, name, description)
VALUES (gen_random_uuid(), 'estimate:revise', 'Create a new estimate revision')
ON CONFLICT (name) DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM (VALUES
  ('SuperAdmin', 'estimate:revise'),
  ('Admin', 'estimate:revise'),
  ('ServiceAdviser', 'estimate:revise'),
  ('ServiceManager', 'estimate:revise')
) AS grants(role_name, permission_name)
JOIN "Role" r ON r.name = grants.role_name
JOIN "Permission" p ON p.name = grants.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
COMMIT;
