-- ============================================================
-- Add fully granular permissions — one permission per activity
-- ============================================================

-- ── 1. Insert new granular permissions ────────────────────────

-- Roles — new granular permissions
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'role:create', 'Create new custom roles' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'role:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'role:delete', 'Delete custom roles' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'role:delete');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'role:permission:update', 'Update permissions assigned to a role' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'role:permission:update');

-- Customer — sub-activity permissions
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'customer:document:create', 'Upload documents for a customer' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'customer:document:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'customer:history:create', 'Add service history records for a customer' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'customer:history:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'customer:account:manage', 'Activate or deactivate customer portal access' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'customer:account:manage');

-- Vehicle — sub-activity permissions
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'vehicle:image:create', 'Upload vehicle images' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'vehicle:image:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'vehicle:ownership:create', 'Record vehicle ownership transfers' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'vehicle:ownership:create');

-- Estimates — separate approve from create
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'estimate:approve', 'Approve or reject repair estimates' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'estimate:approve');

-- Transfers — separate reject and cancel
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'transfer:reject', 'Reject inter-branch transfer requests' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'transfer:reject');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'transfer:cancel', 'Cancel inter-branch transfer requests' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'transfer:cancel');

-- Credit — own permissions instead of reusing invoice permissions
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'credit:application:create', 'Submit credit applications' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'credit:application:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'credit:adjust', 'Adjust customer credit limits and balances' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'credit:adjust');


-- ── 2. Map new permissions to roles ──────────────────────────

-- Admin — gets all new permissions
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Admin' AND p."name" IN (
  'role:create','role:delete','role:permission:update',
  'customer:document:create','customer:history:create','customer:account:manage',
  'vehicle:image:create','vehicle:ownership:create',
  'estimate:approve',
  'transfer:reject','transfer:cancel',
  'credit:application:create','credit:adjust'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- WorkshopManager — gets estimate:approve
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'WorkshopManager' AND p."name" IN (
  'estimate:approve'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- ServiceAdviser — gets estimate:approve, customer:document:create
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'ServiceAdviser' AND p."name" IN (
  'estimate:approve','customer:document:create'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- Receptionist — gets customer:document:create
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Receptionist' AND p."name" IN (
  'customer:document:create'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- ReceptionManager — gets all customer/vehicle sub-permissions
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'ReceptionManager' AND p."name" IN (
  'customer:document:create','customer:history:create','customer:account:manage',
  'vehicle:image:create','vehicle:ownership:create'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);
