-- Legacy storelocation.ShortName (filled for every store location, e.g. VI-2).
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "shortName" TEXT;
