-- Register CSI actions for Roles settings without resetting existing role assignments.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'csi:master:read', 'View CSI attributes, responses and card masters', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csi:master:update', 'Create and update CSI attributes, responses and card masters', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csi:card:generate', 'Generate and print CSI questionnaires', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csi:response:read', 'View issued CSI questionnaires and customer responses', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'csi:response:update', 'Enter and correct customer CSI responses', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csi', 'Run the customer satisfaction report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csi-attribute', 'Run the CSI attribute report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:csi-checklist', 'Run the CSI checklist report', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Match ROLE_PERMISSIONS. Only add CSI grants; preserve all existing assignments.
WITH grants AS (
  SELECT role_name, permission_name
  FROM (VALUES ('SuperAdmin'), ('Admin'), ('ServiceManager')) AS roles(role_name)
  CROSS JOIN (VALUES ('csi:master:read'), ('csi:master:update'), ('csi:card:generate'),
                     ('csi:response:read'), ('csi:response:update'), ('report:csi'),
                     ('report:csi-attribute'), ('report:csi-checklist')) AS perms(permission_name)
  UNION ALL
  SELECT role_name, permission_name
  FROM (VALUES ('WorkshopManager'), ('Auditor')) AS roles(role_name)
  CROSS JOIN (VALUES ('csi:master:read'), ('csi:response:read'), ('report:csi'),
                     ('report:csi-attribute'), ('report:csi-checklist')) AS perms(permission_name)
  UNION ALL
  SELECT role_name, permission_name
  FROM (VALUES ('CCUManager'), ('CCUOfficer')) AS roles(role_name)
  CROSS JOIN (VALUES ('csi:card:generate'), ('csi:response:read'),
                     ('csi:response:update')) AS perms(permission_name)
)
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM grants g
JOIN "Role" r ON r.name = g.role_name
JOIN "Permission" p ON p.name = g.permission_name
ON CONFLICT DO NOTHING;
