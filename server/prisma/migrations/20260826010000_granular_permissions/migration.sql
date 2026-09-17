-- ============================================================
-- Break down grouped permissions into granular per-activity permissions
-- ============================================================

-- ── 1. Insert new granular permissions ────────────────────────

-- Service — Appointments
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'appointment:read',   'View service appointments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'appointment:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'appointment:create', 'Create service appointments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'appointment:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'appointment:update', 'Update service appointments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'appointment:update');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'appointment:delete', 'Delete service appointments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'appointment:delete');

-- Service — Job Cards
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'jobcard:read',   'View job cards' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'jobcard:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'jobcard:create', 'Create job cards' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'jobcard:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'jobcard:update', 'Update job cards' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'jobcard:update');

-- Service — Inspections
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'inspection:read',   'View inspections' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'inspection:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'inspection:create', 'Create inspections' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'inspection:create');

-- Service — Estimates
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'estimate:read',   'View estimates' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'estimate:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'estimate:create', 'Create estimates and approvals' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'estimate:create');

-- Workshop — Assignment
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'assignment:create', 'Assign technicians to job cards' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'assignment:create');

-- Workshop — Job Progress
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'jobprogress:update', 'Update job card progress' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'jobprogress:update');

-- Workshop — Quality Control
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'qcstatus:update', 'Update QC status' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'qcstatus:update');

-- Inventory — Spare Parts
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'sparepart:read',   'View spare parts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'sparepart:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'sparepart:create', 'Create spare parts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'sparepart:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'sparepart:update', 'Update spare parts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'sparepart:update');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'sparepart:delete', 'Delete spare parts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'sparepart:delete');

-- Inventory — Stock
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'stock:read',   'View branch stock levels' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'stock:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'stock:update', 'Adjust stock levels' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'stock:update');

-- Inventory — Purchase Requests
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'purchaserequest:read',   'View purchase requests' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'purchaserequest:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'purchaserequest:create', 'Create purchase requests' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'purchaserequest:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'purchaserequest:update', 'Update purchase request status' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'purchaserequest:update');

-- Inventory — Part Issuances
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'partissuance:read',   'View part issuances' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'partissuance:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'partissuance:create', 'Create part issuances' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'partissuance:create');

-- Inventory — Part Returns
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'partreturn:read',   'View part returns' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'partreturn:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'partreturn:create', 'Create part returns' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'partreturn:create');

-- Finance — Invoices
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'invoice:read',   'View invoices' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'invoice:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'invoice:create', 'Create invoices' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'invoice:create');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'invoice:update', 'Update invoices' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'invoice:update');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'invoice:delete', 'Delete invoices' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'invoice:delete');

-- Finance — Payments
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'payment:read',   'View payments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'payment:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'payment:create', 'Record payments' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'payment:create');

-- Finance — Receipts
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'receipt:read',   'View receipts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'receipt:read');
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'receipt:create', 'Generate receipts' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'receipt:create');

-- Finance — Reports
INSERT INTO "Permission" ("id", "name", "description") SELECT gen_random_uuid(), 'financereport:read', 'View financial reports' WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "name" = 'financereport:read');


-- ── 2. Map new permissions to roles ──────────────────────────

-- Admin
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Admin' AND p."name" IN (
  'appointment:read','appointment:create','appointment:update',
  'jobcard:read','jobcard:create','jobcard:update',
  'inspection:read','inspection:create',
  'estimate:read','estimate:create',
  'workshop:read','assignment:create','jobprogress:update','qcstatus:update',
  'sparepart:read','sparepart:create','sparepart:update',
  'stock:read','stock:update',
  'purchaserequest:read','purchaserequest:create','purchaserequest:update',
  'partissuance:read','partissuance:create',
  'partreturn:read','partreturn:create',
  'invoice:read','invoice:create','invoice:update',
  'payment:read','payment:create',
  'receipt:read','receipt:create',
  'audit:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- GeneralStoreManager
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'GeneralStoreManager' AND p."name" IN (
  'sparepart:read','sparepart:create','sparepart:update','sparepart:delete',
  'stock:read','stock:update',
  'purchaserequest:read','purchaserequest:create','purchaserequest:update',
  'partissuance:read','partissuance:create',
  'partreturn:read','partreturn:create',
  'transfer:read','transfer:create','transfer:update','transfer:approve','transfer:dispatch','transfer:receive',
  'services:read',
  'jobcard:read',
  'vehicle:read','customer:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- BranchStoreManager
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'BranchStoreManager' AND p."name" IN (
  'sparepart:read','sparepart:create','sparepart:update',
  'stock:read','stock:update',
  'purchaserequest:read','purchaserequest:create',
  'partissuance:read','partissuance:create',
  'partreturn:read','partreturn:create',
  'transfer:read','transfer:create','transfer:receive',
  'services:read',
  'jobcard:read',
  'vehicle:read','customer:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- WorkshopManager
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'WorkshopManager' AND p."name" IN (
  'jobcard:read','jobcard:create','jobcard:update',
  'appointment:read','appointment:create','appointment:update','appointment:delete',
  'inspection:read','inspection:create',
  'estimate:read','estimate:create',
  'workshop:read','assignment:create','jobprogress:update','qcstatus:update',
  'sparepart:read','stock:read',
  'vehicle:read','vehicle:update','customer:read',
  'invoice:read',
  'services:read','services:create','services:update','services:delete'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- Accountant
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Accountant' AND p."name" IN (
  'invoice:read','invoice:create','invoice:update',
  'payment:read','payment:create',
  'receipt:read','receipt:create',
  'financereport:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- ServiceAdviser
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'ServiceAdviser' AND p."name" IN (
  'customer:read','customer:create','customer:update',
  'vehicle:read','vehicle:create','vehicle:update',
  'appointment:read','appointment:create','appointment:update',
  'jobcard:read','jobcard:create',
  'inspection:read',
  'estimate:read','estimate:create',
  'workshop:read',
  'sparepart:read','stock:read',
  'invoice:read','invoice:create',
  'services:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- Technician
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Technician' AND p."name" IN (
  'vehicle:read',
  'jobcard:read','jobcard:update',
  'inspection:read','inspection:create',
  'estimate:read',
  'services:read',
  'workshop:read','jobprogress:update',
  'sparepart:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- Receptionist
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'Receptionist' AND p."name" IN (
  'customer:read','customer:create',
  'vehicle:read','vehicle:create',
  'appointment:read','appointment:create',
  'services:read',
  'invoice:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);

-- ReceptionManager
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r, "Permission" p
WHERE r."name" = 'ReceptionManager' AND p."name" IN (
  'customer:read','customer:create','customer:update','customer:delete',
  'vehicle:read','vehicle:create','vehicle:update','vehicle:delete',
  'appointment:read','appointment:create','appointment:update','appointment:delete',
  'jobcard:read','jobcard:create',
  'services:read'
) AND NOT EXISTS (
  SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
);


-- ── 3. Remove old grouped permissions ────────────────────────

-- Delete RolePermission links for old grouped permissions
DELETE FROM "RolePermission" WHERE "permissionId" IN (
  SELECT "id" FROM "Permission" WHERE "name" IN (
    'service:read','service:create','service:update','service:delete',
    'inventory:read','inventory:create','inventory:update','inventory:delete',
    'workshop:update',
    'finance:read','finance:create','finance:update'
  )
);

-- Delete old grouped Permission records
DELETE FROM "Permission" WHERE "name" IN (
  'service:read','service:create','service:update','service:delete',
  'inventory:read','inventory:create','inventory:update','inventory:delete',
  'workshop:update',
  'finance:read','finance:create','finance:update'
);
