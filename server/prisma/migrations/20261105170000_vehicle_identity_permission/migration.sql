-- Vehicle identity (gap analysis §4): vehicle:identity:update replaces legacy's shared
-- SettingMaster.VehicleUpdatePassword for VIN, registration, engine number, model and sale date.
-- Granted to Admin (SuperAdmin has every permission); grant it per user to others. Idempotent.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'vehicle:identity:update', 'Change a vehicle''s VIN, registration, engine number, model or sale date', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r JOIN "Permission" p ON p.name = 'vehicle:identity:update'
WHERE r.name IN ('SuperAdmin', 'Admin')
ON CONFLICT DO NOTHING;
