-- DISPOSABLE TEST DATABASE ONLY. See doc/issue-77-progress.md Phase 3 validation.

DO $$
BEGIN
 IF (SELECT COUNT(*) FROM "PartyNote")<>3 THEN RAISE EXCEPTION 'Expected exactly three legacy notes'; END IF;
 IF (SELECT "creditBalance" FROM "Customer" WHERE id='00000000-0000-4000-8000-000000000001')<>35 THEN RAISE EXCEPTION 'Wallet/advance credit was lost or duplicated'; END IF;
 IF (SELECT "creditBalance" FROM "Customer" WHERE id='00000000-0000-4000-8000-000000000002')<>0 OR (SELECT amount FROM "PartyNote" WHERE "legacyKey"='WALLET:00000000-0000-4000-8000-000000000002')<>7 THEN RAISE EXCEPTION 'Negative wallet was not preserved as debit'; END IF;
 IF (SELECT COUNT(*) FROM "PartyAdjustmentBatch")<>1 OR (SELECT COUNT(*) FROM "ReceiptAllocation")<>2 THEN RAISE EXCEPTION 'Legacy applications duplicated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ReceiptAllocation" a JOIN "Receipt" r ON r.id=a."receiptId" WHERE a.id='00000000-0000-4000-8000-000000000040' AND a."adjustedAt"=r."issuedAt") THEN RAISE EXCEPTION 'Receipt allocation date/ID not retained'; END IF;
 IF (SELECT "outstandingAmount" FROM "Invoice" WHERE id='00000000-0000-4000-8000-000000000020')<>100 THEN RAISE EXCEPTION 'Legacy cache must remain for phase 5 repair'; END IF;
 IF (SELECT COUNT(*) FROM "AuditLog" WHERE action='PARTY_CREDIT_MIGRATED')<>1 THEN RAISE EXCEPTION 'Backfill audit duplicated'; END IF;
 IF (SELECT "cancelledAt" FROM "Receipt" WHERE id='00000000-0000-4000-8000-000000000032')<>(SELECT "createdAt" FROM "AuditLog" WHERE id='00000000-0000-4000-8000-000000000070') THEN RAISE EXCEPTION 'Cancellation audit time not preserved'; END IF;
END $$;
SELECT 'Wallet/advance/opening/application/old-allocation/audit/cancellation assertions passed' result;
