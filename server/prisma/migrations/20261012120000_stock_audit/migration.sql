-- Stock audit (legacy Stock Audit: Internal Audit, Audit by Audit Head, Audit by Visiting Management).
-- An audit is a stock taking of type AUDIT. It is counted the same way, but only reports shortage and
-- excess. It never adjusts stock and never freezes it (the freeze trigger only looks at ANNUAL).

-- AlterEnum
ALTER TYPE "StockTakeType" ADD VALUE 'AUDIT';

-- CreateEnum
CREATE TYPE "StockAuditLevel" AS ENUM ('INTERNAL', 'AUDIT_HEAD', 'VISITING_MANAGEMENT');

-- AlterTable
ALTER TABLE "StockTake" ADD COLUMN "auditLevel" "StockAuditLevel",
ADD COLUMN "auditors" TEXT;

-- Stock audit permissions. Kept apart from stocktake so a branch store cannot audit itself.
INSERT INTO "Permission"(id,name,description) VALUES
 (md5('stockaudit:read')::uuid::text,'stockaudit:read','View stock audits and their shortage and excess'),
 (md5('stockaudit:manage')::uuid::text,'stockaudit:manage','Create stock audits, issue audit sheets, record and complete audit counts')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (r.name IN ('SuperAdmin','Admin','GeneralStoreManager','Accountant') AND p.name IN ('stockaudit:read','stockaudit:manage'))
   OR (r.name = 'BranchStoreManager' AND p.name = 'stockaudit:read')
ON CONFLICT DO NOTHING;
