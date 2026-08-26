-- Insert the audit:read permission if it doesn't exist
INSERT INTO "public"."Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'audit:read', 'Permission to read audit logs'
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."Permission" WHERE "name" = 'audit:read'
);

-- Link audit:read to the Admin role
INSERT INTO "public"."RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "public"."Role" r, "public"."Permission" p
WHERE r."name" = 'Admin' AND p."name" = 'audit:read'
AND NOT EXISTS (
  SELECT 1 FROM "public"."RolePermission" rp
  WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);
