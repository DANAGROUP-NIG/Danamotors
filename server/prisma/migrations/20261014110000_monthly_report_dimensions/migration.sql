BEGIN;
ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "engineerId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "ServiceAppointment" ADD COLUMN IF NOT EXISTS "serviceTypeId" TEXT REFERENCES "WorkshopMaster"(id) ON DELETE RESTRICT;
ALTER TABLE "Estimate" ALTER COLUMN "jobCardId" DROP NOT NULL;
ALTER TABLE "Estimate" ALTER COLUMN currency SET DEFAULT 'NGN';
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "estimateNumber" TEXT;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "estimateDate" TIMESTAMP(3);
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "vehicleId" TEXT REFERENCES "Vehicle"(id) ON DELETE RESTRICT;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "customerId" TEXT REFERENCES "Customer"(id) ON DELETE RESTRICT;
ALTER TABLE "Estimate" ADD COLUMN IF NOT EXISTS "branchId" TEXT REFERENCES "Branch"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS "Estimate_estimateNumber_key" ON "Estimate"("estimateNumber");
-- Prisma's @updatedAt is populated by Prisma Client, not by a database default.
INSERT INTO "Role" (id,name,description,"createdAt","updatedAt") VALUES (md5('issue79:Engineer')::uuid::text,'Engineer','Floor engineer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (name) DO NOTHING;
INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p WHERE r.name='Engineer' AND p.name IN ('jobcard:read','workshop:read') ON CONFLICT DO NOTHING;
COMMIT;
