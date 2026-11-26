-- Dispatch challans (20261124120000) gave challan:read to Accountant and Auditor before the department
-- roles existed; the department roles built on those two inherit it in ROLE_PERMISSIONS, so grant it here.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('AccountOfficer', 'challan:read'),
  ('AccountManager', 'challan:read'),
  ('GeneralAccountManager', 'challan:read'),
  ('AuditOfficer', 'challan:read'),
  ('AuditManager', 'challan:read'),
  ('GeneralAuditManager', 'challan:read')
) AS grants(role_name, permission_name)
JOIN "Role" r ON r."name" = grants.role_name
JOIN "Permission" p ON p."name" = grants.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
