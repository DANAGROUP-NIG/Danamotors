-- ============================================================
-- Add system-group permissions so every endpoint group is
-- represented in the permission model:
--   dashboard, notification, search
-- Granted to all staff roles (personal / shared system features).
-- ============================================================

-- 1. Insert new permissions
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'dashboard:read', 'View the dashboard and its statistics' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'dashboard:read');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'notification:read', 'View notifications' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'notification:read');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'notification:update', 'Mark notifications as read' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'notification:update');
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), 'search:read', 'Use the global search across records' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'search:read');

-- 2. Grant to all staff roles
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" IN (
  'Admin', 'GeneralStoreManager', 'BranchStoreManager', 'WorkshopManager',
  'Accountant', 'ServiceAdviser', 'Technician', 'Receptionist', 'ReceptionManager'
)
AND p."name" IN ('dashboard:read','notification:read','notification:update','search:read')
AND NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
