-- ============================================================
-- Workshop reports: bookings (service type, mileage, requests, booking status and
-- number), free service number and coupon, mileage bands and report settings.
-- Additive and idempotent; existing rows are backfilled where the data allows.
-- ============================================================

-- 1. Booking status
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'CONVERTED', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ServiceAppointment"
  ADD COLUMN IF NOT EXISTS "bookingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceTypeId" TEXT,
  ADD COLUMN IF NOT EXISTS "mileage" INTEGER,
  ADD COLUMN IF NOT EXISTS "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'BOOKED';

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceAppointment_bookingNumber_key" ON "ServiceAppointment"("bookingNumber");
CREATE INDEX IF NOT EXISTS "ServiceAppointment_serviceTypeId_idx" ON "ServiceAppointment"("serviceTypeId");

DO $$ BEGIN
  ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_serviceTypeId_fkey"
    FOREIGN KEY ("serviceTypeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_mileage_check" CHECK ("mileage" IS NULL OR "mileage" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Booking requests
CREATE TABLE IF NOT EXISTS "AppointmentRequest" (
  "id" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "complaintCodeId" TEXT,
  "description" TEXT NOT NULL,
  "estimatedParts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedLabour" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "estimatedOil" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppointmentRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AppointmentRequest_appointmentId_idx" ON "AppointmentRequest"("appointmentId");

DO $$ BEGIN
  ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_appointmentId_fkey"
    FOREIGN KEY ("appointmentId") REFERENCES "ServiceAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_complaintCodeId_fkey"
    FOREIGN KEY ("complaintCodeId") REFERENCES "WorkshopMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_estimates_check"
    CHECK ("estimatedParts" >= 0 AND "estimatedLabour" >= 0 AND "estimatedOil" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Backfill booking status from what already happened
UPDATE "ServiceAppointment" a SET "bookingStatus" = 'CONVERTED'
WHERE a."bookingStatus" = 'BOOKED'
  AND EXISTS (SELECT 1 FROM "JobCard" j WHERE j."appointmentId" = a."id" AND j."status" NOT IN ('CANCELLED', 'Cancelled'));

UPDATE "ServiceAppointment" SET "bookingStatus" = 'CANCELLED'
WHERE "bookingStatus" = 'BOOKED' AND LOWER("status") IN ('cancelled', 'canceled');

UPDATE "ServiceAppointment" SET "bookingStatus" = 'NO_SHOW'
WHERE "bookingStatus" = 'BOOKED' AND LOWER(REPLACE("status", '-', ' ')) IN ('no show', 'noshow');

-- 4. Backfill booking numbers (BK + year + 6-digit sequence), continuing any live sequence
WITH numbered AS (
  SELECT "id",
         EXTRACT(YEAR FROM "createdAt")::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt", "id") AS n
  FROM "ServiceAppointment"
  WHERE "bookingNumber" IS NULL
)
UPDATE "ServiceAppointment" a
SET "bookingNumber" = 'BK' || numbered.yr || LPAD((numbered.n + COALESCE(ds."value", 0))::text, 6, '0')
FROM numbered
LEFT JOIN "DocumentSequence" ds ON ds."key" = 'BOOKING_' || numbered.yr
WHERE a."id" = numbered."id";

INSERT INTO "DocumentSequence" ("key", "value", "updatedAt")
SELECT 'BOOKING_' || SUBSTRING("bookingNumber" FROM 3 FOR 4), MAX(SUBSTRING("bookingNumber" FROM 7)::int), NOW()
FROM "ServiceAppointment"
WHERE "bookingNumber" ~ '^BK[0-9]{10}$'
GROUP BY 1
ON CONFLICT ("key") DO UPDATE SET "value" = GREATEST("DocumentSequence"."value", EXCLUDED."value"), "updatedAt" = NOW();

-- 5. Free service number on service types, coupon number on job cards
ALTER TABLE "WorkshopMaster" ADD COLUMN IF NOT EXISTS "freeServiceNo" INTEGER;
DO $$ BEGIN
  ALTER TABLE "WorkshopMaster" ADD CONSTRAINT "WorkshopMaster_freeServiceNo_check" CHECK ("freeServiceNo" IS NULL OR "freeServiceNo" BETWEEN 1 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Number free service types whose code or name says which service they are; the rest are
-- set in Settings → Workshop masters.
UPDATE "WorkshopMaster" SET "freeServiceNo" = CASE
    WHEN UPPER("code") IN ('F1', '1FS', 'FS1') OR "description" ~* '^(1st|first)\M' THEN 1
    WHEN UPPER("code") IN ('F2', '2FS', 'FS2') OR "description" ~* '^(2nd|second)\M' THEN 2
    WHEN UPPER("code") IN ('F3', '3FS', 'FS3') OR "description" ~* '^(3rd|third)\M' THEN 3
  END
WHERE "kind" = 'SERVICE_TYPE' AND "freeService" = true AND "freeServiceNo" IS NULL;

ALTER TABLE "JobCard" ADD COLUMN IF NOT EXISTS "freeServiceCouponNo" TEXT;

-- 6. Mileage bands and report settings
CREATE TABLE IF NOT EXISTS "MileageBand" (
  "id" TEXT NOT NULL,
  "fromKm" INTEGER NOT NULL,
  "toKm" INTEGER,
  "label" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MileageBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MileageBand_range_check" CHECK ("fromKm" >= 0 AND ("toKm" IS NULL OR "toKm" >= "fromKm"))
);
CREATE INDEX IF NOT EXISTS "MileageBand_sortOrder_idx" ON "MileageBand"("sortOrder");

INSERT INTO "MileageBand" ("id", "fromKm", "toKm", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), v.from_km, v.to_km, v.label, v.sort_order, NOW()
FROM (VALUES
  (0, 1000, '0–1,000 km', 1),
  (1001, 5000, '1,001–5,000 km', 2),
  (5001, 10000, '5,001–10,000 km', 3),
  (10001, 20000, '10,001–20,000 km', 4),
  (20001, 40000, '20,001–40,000 km', 5),
  (40001, 60000, '40,001–60,000 km', 6),
  (60001, 100000, '60,001–100,000 km', 7),
  (100001, NULL, '100,000+ km', 8)
) AS v(from_km, to_km, label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "MileageBand");

CREATE TABLE IF NOT EXISTS "ReportSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSetting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "ReportSetting" ("key", "value", "updatedAt")
VALUES ('progress.dueSoonHours', '2'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;
