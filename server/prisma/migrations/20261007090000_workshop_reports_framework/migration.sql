-- ============================================================
-- Workshop reports framework: one permission per report, default grants,
-- and indexes for the report date filters.
-- Mirrors ROLE_PERMISSIONS in src/shared/constants/roles.ts.
-- Idempotent: safe to run on databases that were already seeded.
-- ============================================================

-- 1. Permissions
INSERT INTO "Permission" ("id", "name", "description")
SELECT gen_random_uuid(), v.name, v.description
FROM (VALUES
  ('report:service-booking', 'Run the service booking report'),
  ('report:job-estimate-register', 'Run the job estimate register'),
  ('report:job-cards-open', 'Run the list of job cards open'),
  ('report:workshop-status', 'Run the workshop status report'),
  ('report:workshop-progress', 'Run the workshop progress report'),
  ('report:service-wise-progress', 'Run the service-wise workshop progress report'),
  ('report:vehicles-to-be-ready', 'Run the vehicles to be ready report'),
  ('report:daily-productivity', 'Run the daily productivity report'),
  ('report:technician-productivity', 'Run the technician productivity report'),
  ('report:daily-labour-register', 'Run the daily labour register'),
  ('report:workshop-bill', 'Run the workshop bill report'),
  ('report:free-service', 'Run the free service report'),
  ('report:before-first-service', 'Run the vehicles reported before first service report'),
  ('report:mileage-wise', 'Run the vehicles visited mileage-wise report'),
  ('report:settings', 'Manage mileage bands and report thresholds')
) AS v(name, description)
WHERE NOT EXISTS (SELECT 1 FROM "Permission" p WHERE p."name" = v.name);

-- 2. Default grants
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM (VALUES
  ('SuperAdmin', 'report:service-booking'),
  ('SuperAdmin', 'report:job-estimate-register'),
  ('SuperAdmin', 'report:job-cards-open'),
  ('SuperAdmin', 'report:workshop-status'),
  ('SuperAdmin', 'report:workshop-progress'),
  ('SuperAdmin', 'report:service-wise-progress'),
  ('SuperAdmin', 'report:vehicles-to-be-ready'),
  ('SuperAdmin', 'report:daily-productivity'),
  ('SuperAdmin', 'report:technician-productivity'),
  ('SuperAdmin', 'report:daily-labour-register'),
  ('SuperAdmin', 'report:workshop-bill'),
  ('SuperAdmin', 'report:free-service'),
  ('SuperAdmin', 'report:before-first-service'),
  ('SuperAdmin', 'report:mileage-wise'),
  ('SuperAdmin', 'report:settings'),

  ('Admin', 'report:service-booking'),
  ('Admin', 'report:job-estimate-register'),
  ('Admin', 'report:job-cards-open'),
  ('Admin', 'report:workshop-status'),
  ('Admin', 'report:workshop-progress'),
  ('Admin', 'report:service-wise-progress'),
  ('Admin', 'report:vehicles-to-be-ready'),
  ('Admin', 'report:daily-productivity'),
  ('Admin', 'report:technician-productivity'),
  ('Admin', 'report:daily-labour-register'),
  ('Admin', 'report:workshop-bill'),
  ('Admin', 'report:free-service'),
  ('Admin', 'report:before-first-service'),
  ('Admin', 'report:mileage-wise'),
  ('Admin', 'report:settings'),

  ('WorkshopManager', 'report:service-booking'),
  ('WorkshopManager', 'report:job-estimate-register'),
  ('WorkshopManager', 'report:job-cards-open'),
  ('WorkshopManager', 'report:vehicles-to-be-ready'),
  ('WorkshopManager', 'report:workshop-status'),
  ('WorkshopManager', 'report:workshop-progress'),
  ('WorkshopManager', 'report:service-wise-progress'),
  ('WorkshopManager', 'report:daily-productivity'),
  ('WorkshopManager', 'report:technician-productivity'),
  ('WorkshopManager', 'report:free-service'),
  ('WorkshopManager', 'report:before-first-service'),
  ('WorkshopManager', 'report:mileage-wise'),
  ('WorkshopManager', 'report:settings'),

  ('Accountant', 'report:daily-labour-register'),
  ('Accountant', 'report:workshop-bill'),
  ('Accountant', 'report:free-service'),

  ('BillingOfficer', 'report:daily-labour-register'),
  ('BillingOfficer', 'report:workshop-bill'),
  ('BillingOfficer', 'report:free-service'),

  ('ServiceAdviser', 'report:service-booking'),
  ('ServiceAdviser', 'report:job-estimate-register'),
  ('ServiceAdviser', 'report:job-cards-open'),
  ('ServiceAdviser', 'report:vehicles-to-be-ready'),

  ('Receptionist', 'report:service-booking'),
  ('Receptionist', 'report:job-estimate-register'),
  ('Receptionist', 'report:job-cards-open'),
  ('Receptionist', 'report:vehicles-to-be-ready')
) AS g(role, permission)
JOIN "Role" r ON r."name" = g.role
JOIN "Permission" p ON p."name" = g.permission
WHERE NOT EXISTS (SELECT 1 FROM "RolePermission" rp WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id");

-- 3. Indexes for the report date filters
CREATE INDEX IF NOT EXISTS "JobCard_branchId_createdAt_idx" ON "JobCard"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobCard_branchId_promisedAt_idx" ON "JobCard"("branchId", "promisedAt");
CREATE INDEX IF NOT EXISTS "Invoice_issuedDate_idx" ON "Invoice"("issuedDate");
CREATE INDEX IF NOT EXISTS "ServiceAppointment_branchId_scheduledAt_idx" ON "ServiceAppointment"("branchId", "scheduledAt");
