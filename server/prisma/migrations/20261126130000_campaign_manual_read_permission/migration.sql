-- Every role can view campaigns, open their manuals and download the affected VIN list
-- (EVERY_ROLE_PERMISSIONS in roles.ts). Customer contacts stay with campaign:vehicle:update.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'campaign:manual:read', 'View campaigns, download campaign manuals and affected VIN lists', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."name" = 'campaign:manual:read'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
