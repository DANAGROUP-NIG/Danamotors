-- ============================================================
-- Warranty & campaign permissions and the WarrantyOfficer role.
-- Mirrors ROLE_PERMISSIONS in src/shared/constants/roles.ts.
-- Idempotent: safe to run on databases that were already seeded.
-- ============================================================

-- 1. Permissions
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), v.name, v.description
FROM (VALUES
  ('jobcard:line:update',     'Add job card parts and labour lines and change who pays for them'),
  ('warranty:read',           'View vehicle warranty coverage and warranty cases'),
  ('warranty:update',         'Edit warranty cases, claim lines and vehicle warranty start dates; charge goodwill'),
  ('warranty:claim',          'Open warranty cases and move them through the manufacturer claim workflow'),
  ('warranty:settings',       'Manage model warranty policies, claim codes and extended warranty or goodwill overrides'),
  ('campaign:read',           'View recall, free-fix and service campaigns'),
  ('campaign:create',         'Create campaigns'),
  ('campaign:update',         'Edit, activate and close campaigns and add affected vehicles'),
  ('campaign:vehicle:update', 'Record outreach and update the status of campaign vehicles')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = v.name);

-- 2. WarrantyOfficer role
INSERT INTO "Role" ("id", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'WarrantyOfficer', 'WarrantyOfficer user role', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'WarrantyOfficer');

-- 3. Grants
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('SuperAdmin', 'jobcard:line:update'), ('SuperAdmin', 'warranty:read'), ('SuperAdmin', 'warranty:update'),
  ('SuperAdmin', 'warranty:claim'), ('SuperAdmin', 'warranty:settings'), ('SuperAdmin', 'campaign:read'),
  ('SuperAdmin', 'campaign:create'), ('SuperAdmin', 'campaign:update'), ('SuperAdmin', 'campaign:vehicle:update'),

  ('Admin', 'jobcard:line:update'), ('Admin', 'warranty:read'), ('Admin', 'warranty:update'),
  ('Admin', 'warranty:claim'), ('Admin', 'warranty:settings'), ('Admin', 'campaign:read'),
  ('Admin', 'campaign:create'), ('Admin', 'campaign:update'), ('Admin', 'campaign:vehicle:update'),

  ('WorkshopManager', 'jobcard:line:update'), ('WorkshopManager', 'warranty:read'), ('WorkshopManager', 'campaign:read'),
  ('Accountant', 'warranty:read'),
  ('ServiceAdviser', 'jobcard:line:update'), ('ServiceAdviser', 'warranty:read'), ('ServiceAdviser', 'campaign:read'),
  ('Receptionist', 'warranty:read'), ('Receptionist', 'campaign:read'), ('Receptionist', 'campaign:vehicle:update'),
  ('ReceptionManager', 'warranty:read'), ('ReceptionManager', 'campaign:read'), ('ReceptionManager', 'campaign:vehicle:update'),

  ('WarrantyOfficer', 'dashboard:read'), ('WarrantyOfficer', 'notification:read'), ('WarrantyOfficer', 'notification:update'),
  ('WarrantyOfficer', 'search:read'), ('WarrantyOfficer', 'customer:read'), ('WarrantyOfficer', 'vehicle:read'),
  ('WarrantyOfficer', 'appointment:read'), ('WarrantyOfficer', 'appointment:create'), ('WarrantyOfficer', 'jobcard:read'),
  ('WarrantyOfficer', 'jobcard:line:update'), ('WarrantyOfficer', 'sparepart:read'), ('WarrantyOfficer', 'invoice:read'),
  ('WarrantyOfficer', 'services:read'), ('WarrantyOfficer', 'warranty:read'), ('WarrantyOfficer', 'warranty:update'),
  ('WarrantyOfficer', 'warranty:claim'), ('WarrantyOfficer', 'warranty:settings'), ('WarrantyOfficer', 'campaign:read'),
  ('WarrantyOfficer', 'campaign:create'), ('WarrantyOfficer', 'campaign:update'), ('WarrantyOfficer', 'campaign:vehicle:update')
) AS g(role, permission)
JOIN "Role" r ON r."name" = g.role
JOIN "Permission" p ON p."name" = g.permission
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");
