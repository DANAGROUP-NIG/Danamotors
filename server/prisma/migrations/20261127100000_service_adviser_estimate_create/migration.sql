INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" IN ('ServiceAdviser', 'QCOfficer')
  AND p."name" = 'estimate:create'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
