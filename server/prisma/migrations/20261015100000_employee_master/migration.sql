-- Legacy Employee master: every workshop employee, with or without a login.
DO $$ BEGIN
  CREATE TYPE "EmployeeType" AS ENUM ('OWN', 'CONTRACT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "EmployeeGrade" AS ENUM ('SENIOR', 'JUNIOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "designationId" TEXT,
  "departmentId" TEXT,
  "teamId" TEXT,
  "employeeType" "EmployeeType" NOT NULL DEFAULT 'OWN',
  "grade" "EmployeeGrade",
  "dateOfBirth" TIMESTAMP(3),
  "qualification" TEXT,
  "bloodGroup" TEXT,
  "experienceYears" DOUBLE PRECISION,
  "block" TEXT,
  "street" TEXT,
  "district" TEXT,
  "city" TEXT,
  "state" TEXT,
  "pin" TEXT,
  "phone" TEXT,
  "joinDate" TIMESTAMP(3),
  "leftDate" TIMESTAMP(3),
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Employee_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Employee_experience_check" CHECK ("experienceYears" IS NULL OR ("experienceYears" >= 0 AND "experienceYears" <= 80))
);
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_userId_key" ON "Employee"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Employee_branchId_code_key" ON "Employee"("branchId", "code");
CREATE INDEX IF NOT EXISTS "Employee_branchId_leftDate_idx" ON "Employee"("branchId", "leftDate");
CREATE INDEX IF NOT EXISTS "Employee_teamId_idx" ON "Employee"("teamId");

INSERT INTO "Permission"(id,name,description) VALUES
 (md5('employee:read')::uuid::text,'employee:read','View the employee master'),
 (md5('employee:manage')::uuid::text,'employee:manage','Create and edit employees, record leaving dates and link logins')
ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE (r.name IN ('SuperAdmin','Admin','WorkshopManager','ServiceManager') AND p.name IN ('employee:read','employee:manage'))
   OR (r.name = 'ServiceAdviser' AND p.name = 'employee:read')
ON CONFLICT DO NOTHING;
