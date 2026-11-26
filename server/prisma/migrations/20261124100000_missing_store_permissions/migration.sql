-- Permissions that were only ever created by the role seed (prisma/seed/roles.ts), so a database
-- where the seed was not re-run never had them: the Shortage Approvals tab stayed hidden, dealer
-- rates and stock values were hidden from store staff, and estimates could not be printed.
-- Creates the three permissions and grants them to the roles ROLE_PERMISSIONS (roles.ts) gives them.
-- Additive and idempotent: existing role permissions, including changes made in Administration,
-- are left alone.

INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'stock:discrepancy:approve', 'Approve the shortage/damage on an MIT or STN receipt', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'sparepart:cost:read', 'See dealer rates, purchase prices, transfer values, stock values, cost and profit', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'estimate:print', 'Print estimates', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
JOIN "Permission" p ON (
     (p.name = 'stock:discrepancy:approve' AND r.name IN ('SuperAdmin', 'Admin', 'GeneralStoreManager'))
  OR (p.name = 'sparepart:cost:read' AND r.name IN ('SuperAdmin', 'Auditor', 'Admin', 'GeneralStoreManager', 'StoreOfficer', 'Accountant'))
  OR (p.name = 'estimate:print' AND r.name IN ('SuperAdmin', 'Admin', 'WorkshopManager', 'ServiceAdviser', 'ServiceManager'))
)
ON CONFLICT DO NOTHING;
