-- Requisition grants mirror ROLE_PERMISSIONS; seed resets use the same defaults.
BEGIN;
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), v.name, v.description
FROM (VALUES
  ('requisition:read', 'Read and print branch job parts requisitions'),
  ('requisition:create', 'Create branch job parts requisitions and issue stock'),
  ('requisition:cancel', 'Cancel unbilled requisitions and reverse stock and charges'),
  ('requisition:goodwill', 'Approve goodwill requisitions with a reason')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p.name = v.name);

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (VALUES
  ('SuperAdmin', 'requisition:read'), ('SuperAdmin', 'requisition:create'),
  ('SuperAdmin', 'requisition:cancel'), ('SuperAdmin', 'requisition:goodwill'),
  ('Admin', 'requisition:read'), ('Admin', 'requisition:create'),
  ('Admin', 'requisition:cancel'), ('Admin', 'requisition:goodwill'),
  ('GeneralStoreManager', 'requisition:read'), ('GeneralStoreManager', 'requisition:create'), ('GeneralStoreManager', 'requisition:cancel'),
  ('StoreOfficer', 'requisition:read'), ('StoreOfficer', 'requisition:create'), ('StoreOfficer', 'requisition:cancel'),
  ('WorkshopManager', 'requisition:read'), ('ServiceAdviser', 'requisition:read'),
  ('ServiceManager', 'requisition:read'), ('WarrantyOfficer', 'requisition:read'), ('WarrantyOfficer', 'requisition:goodwill')
) AS grants(role_name, permission_name)
JOIN "Role" r ON r.name = grants.role_name
JOIN "Permission" p ON p.name = grants.permission_name
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
COMMIT;
