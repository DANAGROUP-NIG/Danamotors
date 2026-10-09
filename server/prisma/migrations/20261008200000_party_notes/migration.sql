BEGIN;
ALTER TABLE "PartyNote" ADD COLUMN IF NOT EXISTS "cancelRemark" TEXT,
 ADD COLUMN IF NOT EXISTS "partyCode" TEXT, ADD COLUMN IF NOT EXISTS "partyName" TEXT,
 ADD COLUMN IF NOT EXISTS "partyAddress" TEXT, ADD COLUMN IF NOT EXISTS "partyCity" TEXT, ADD COLUMN IF NOT EXISTS "partyState" TEXT;
CREATE TABLE IF NOT EXISTS "PartyNoteReceiptLine" (
 id TEXT PRIMARY KEY, "noteId" TEXT NOT NULL REFERENCES "PartyNote"(id) ON DELETE RESTRICT,
 "receiptId" TEXT NOT NULL REFERENCES "Receipt"(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL, amount DECIMAL(18,2) NOT NULL CHECK(amount>0),
 "receiptNumber" TEXT NOT NULL, "receiptDate" TIMESTAMP(3) NOT NULL,
 "chequeNumber" TEXT, "receiptAmount" DECIMAL(18,2) NOT NULL, narration TEXT NOT NULL,
 CONSTRAINT "PartyNoteReceiptLine_noteId_receiptId_key" UNIQUE("noteId","receiptId"),
 CONSTRAINT "PartyNoteReceiptLine_noteId_position_key" UNIQUE("noteId",position),
 CHECK(amount<="receiptAmount")
);
CREATE TABLE IF NOT EXISTS "PartyNoteAccountLine" (
 id TEXT PRIMARY KEY, "noteId" TEXT NOT NULL REFERENCES "PartyNote"(id) ON DELETE RESTRICT,
 "ledgerId" TEXT NOT NULL REFERENCES "TallyLedger"(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL, "accountCode" TEXT NOT NULL, "accountName" TEXT NOT NULL,
 narration TEXT NOT NULL, amount DECIMAL(18,2) NOT NULL CHECK(amount>0),
 CONSTRAINT "PartyNoteAccountLine_noteId_position_key" UNIQUE("noteId",position)
);
-- Branch/type/date matches the paginated note register and Tally daily lookup.
CREATE INDEX IF NOT EXISTS "PartyNote_branchId_direction_date_idx" ON "PartyNote"("branchId",direction,date);
-- Referenced receipt and ledger indexes support foreign-key checks without scans.
CREATE INDEX IF NOT EXISTS "PartyNoteReceiptLine_receiptId_idx" ON "PartyNoteReceiptLine"("receiptId");
CREATE INDEX IF NOT EXISTS "PartyNoteAccountLine_ledgerId_idx" ON "PartyNoteAccountLine"("ledgerId");
INSERT INTO "Permission"(id,name,description,"createdAt")
SELECT md5(p.name)::uuid::text,p.name,p.description,CURRENT_TIMESTAMP FROM (VALUES
 ('debitnote:read','Read and print debit notes'),('debitnote:create','Create debit notes'),('debitnote:cancel','Cancel unadjusted debit notes'),
 ('creditnote:read','Read and print credit notes'),('creditnote:create','Create credit notes'),('creditnote:cancel','Cancel unadjusted credit notes'),
 ('report:debit-note-register','Debit note register'),('report:credit-note-register','Credit note register')
) p(name,description) ON CONFLICT(name) DO NOTHING;
INSERT INTO "RolePermission"("roleId","permissionId")
SELECT r.id,p.id FROM "Role" r CROSS JOIN "Permission" p
WHERE r.name IN ('Admin','SuperAdmin','Accountant')
 AND p.name IN ('debitnote:read','debitnote:create','debitnote:cancel','creditnote:read','creditnote:create','creditnote:cancel','report:debit-note-register','report:credit-note-register')
ON CONFLICT DO NOTHING;
COMMIT;
