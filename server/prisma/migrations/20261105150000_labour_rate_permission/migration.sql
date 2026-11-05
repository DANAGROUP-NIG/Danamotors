-- Model labour rate maintenance (gap analysis §6): labour-rate:update, granted to Admin.
-- It replaces the Admin/SuperAdmin role check on rate writes, so per-user grants (item 5) can give it.
-- Additive and idempotent.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'labour-rate:update', 'Edit model labour rates, one at a time or in bulk', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r JOIN "Permission" p ON p.name = 'labour-rate:update'
WHERE r.name IN ('SuperAdmin', 'Admin')
ON CONFLICT DO NOTHING;
