-- Late deliveries (promised date / time discrepancy). Additive and idempotent.

-- The delay remark entered on the promise date / time details screens.
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "lateRemarks" TEXT;

-- The six legacy late-delivery reasons (codes 1-6, the legend on the legacy screens).
INSERT INTO "WorkshopMaster" ("id", "kind", "code", "description", "displayOrder", "active", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'LATE_REASON', '1', 'Engineer absent', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LATE_REASON', '2', 'Spare unavailable', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LATE_REASON', '3', 'On diagnosis', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LATE_REASON', '4', 'Customer''s decision awaited', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LATE_REASON', '5', 'Wrong estimation', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'LATE_REASON', '6', 'Open time', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("kind", "code") DO NOTHING;

-- TODO(confirm): the two earlier reasons overlap with 2 (Spare unavailable) and 4 (Customer's decision
-- awaited). They are made inactive, not deleted: jobs that used them keep them, and an admin can
-- re-activate them in Workshop masters.
UPDATE "WorkshopMaster" SET "active" = false, "displayOrder" = 90, "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'LATE_REASON' AND "code" IN ('PARTS', 'APPROVAL') AND "active" = true;

-- Permissions.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES
  (gen_random_uuid()::text, 'jobcard:late-reason:update', 'Enter or correct late-delivery reasons and remarks (promise date / time details entry)', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:promise-date-discrepancy', 'Run the promised date discrepancy report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:promise-time-discrepancy', 'Run the promised time discrepancy report', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:promise-date-analysis', 'Run the promised date delayed delivery analysis', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:promise-time-analysis', 'Run the promised time delayed delivery analysis', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'report:delayed-deliveries', 'Run the list of delayed deliveries', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Same grants as ROLE_PERMISSIONS in src/shared/constants/roles.ts (the Auditor gets the reports only).
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM (
  SELECT role_name, permission_name
  FROM (VALUES ('SuperAdmin'), ('Admin'), ('WorkshopManager'), ('ServiceManager')) AS roles(role_name)
  CROSS JOIN (VALUES ('jobcard:late-reason:update'), ('report:promise-date-discrepancy'), ('report:promise-time-discrepancy'),
                     ('report:promise-date-analysis'), ('report:promise-time-analysis'), ('report:delayed-deliveries')) AS perms(permission_name)
  UNION ALL
  SELECT 'Auditor', permission_name
  FROM (VALUES ('report:promise-date-discrepancy'), ('report:promise-time-discrepancy'), ('report:promise-date-analysis'),
               ('report:promise-time-analysis'), ('report:delayed-deliveries')) AS perms(permission_name)
) AS g
JOIN "Role" r ON r.name = g.role_name
JOIN "Permission" p ON p.name = g.permission_name
ON CONFLICT DO NOTHING;
