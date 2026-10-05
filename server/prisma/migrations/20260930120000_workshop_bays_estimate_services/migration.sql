UPDATE "WorkshopMaster"
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'BAY' AND "code" IN ('S01', 'E01');

INSERT INTO "WorkshopMaster" ("id", "kind", "code", "description", "category", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'BAY', bay.code, 'Bay ' || bay.code, left(bay.code, 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unnest(ARRAY[
  'A1', 'A2', 'A3', 'A4', 'A5',
  'B1', 'B2', 'B3', 'B4', 'B5',
  'C1', 'C2', 'C3', 'C4', 'C5',
  'D1', 'D2', 'D3', 'D4', 'D5',
  'E1', 'E2', 'E3', 'E4', 'E5'
]) AS bay(code)
ON CONFLICT ("kind", "code") DO UPDATE
SET "description" = EXCLUDED."description",
    "category" = EXCLUDED."category",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;