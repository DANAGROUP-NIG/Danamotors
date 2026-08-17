-- Add source column to ServiceAppointment
ALTER TABLE "ServiceAppointment"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'WalkIn';

-- Create Enquiry table
CREATE TABLE IF NOT EXISTS "Enquiry" (
  "id"                TEXT NOT NULL,
  "firstName"         TEXT NOT NULL,
  "lastName"          TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "phoneNumber"       TEXT NOT NULL,
  "vehicleMake"       TEXT,
  "vehicleModel"      TEXT,
  "vehicleYear"       INTEGER,
  "vehicleRegNumber"  TEXT,
  "serviceDescription" TEXT NOT NULL,
  "preferredDate"     TIMESTAMP(3),
  "branchId"          TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'Pending',
  "appointmentId"     TEXT,
  "reviewedById"      TEXT,
  "reviewNotes"       TEXT,
  "reviewedAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Enquiry_appointmentId_key" UNIQUE ("appointmentId"),
  CONSTRAINT "Enquiry_branchId_fkey" FOREIGN KEY ("branchId")
    REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Enquiry_appointmentId_fkey" FOREIGN KEY ("appointmentId")
    REFERENCES "ServiceAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Enquiry_reviewedById_fkey" FOREIGN KEY ("reviewedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Enquiry_branchId_status_idx" ON "Enquiry"("branchId", "status");
CREATE INDEX IF NOT EXISTS "Enquiry_email_idx" ON "Enquiry"("email");
