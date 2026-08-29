-- ============================================================
-- Separate Enquiry permissions from Customer/Appointment perms
-- Enquiries get their own read / create / update / delete
-- ============================================================

-- 1. Insert new enquiry permissions
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'enquiry:read',   'View appointment enquiries' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'enquiry:read');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'enquiry:create', 'Create appointment enquiries' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'enquiry:create');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'enquiry:update', 'Review / update appointment enquiries' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'enquiry:update');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'enquiry:delete', 'Delete appointment enquiries' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'enquiry:delete');

-- 2. Map new permissions to roles
-- Admin gets all four
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Admin' AND p."name" IN ('enquiry:read','enquiry:create','enquiry:update','enquiry:delete')
AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- Receptionist gets read + create
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Receptionist' AND p."name" IN ('enquiry:read','enquiry:create')
AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- ReceptionManager gets all four
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'ReceptionManager' AND p."name" IN ('enquiry:read','enquiry:create','enquiry:update','enquiry:delete')
AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
