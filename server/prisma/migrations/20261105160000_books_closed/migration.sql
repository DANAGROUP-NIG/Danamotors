-- ============================================================
-- Books closed date (gap analysis §7): the period lock that replaces legacy Year End's
-- Fayear.FinancialYearFreezed. The financial year is January-December (legacy fayear 20252026 holds
-- 2 Jan - 31 Dec 2025 in all three databases).
--
-- 1. FinanceSetting 'booksClosedUpTo' = {"date": "YYYY-MM-DD"}: the company-wide date.
--    BranchSettings."booksClosedUpTo": an optional later date for one branch.
--    A branch's books are closed up to the later of the two (books_closed_up_to()).
-- 2. books_closed_guard(): a BEFORE trigger on every dated finance and stock table. A row dated on or
--    before the closed date cannot be inserted or deleted, and its money, date, party and cancellation
--    columns cannot change. Other columns (outstanding amounts, Tally posting, receipt at the destination,
--    discrepancy approval) still can, so open-period work that touches an old document keeps working.
--    The error handler turns BOOKS_CLOSED into a 409.
-- 3. books:close, held by SuperAdmin only.
-- Dates are Africa/Lagos calendar dates. Additive and idempotent.
-- ============================================================

ALTER TABLE "BranchSettings" ADD COLUMN IF NOT EXISTS "booksClosedUpTo" DATE;

CREATE OR REPLACE FUNCTION books_closed_up_to(p_branch TEXT) RETURNS DATE STABLE LANGUAGE sql AS $$
    SELECT GREATEST(
        (SELECT (value ->> 'date')::date FROM "FinanceSetting" WHERE key = 'booksClosedUpTo'),
        (SELECT s."booksClosedUpTo" FROM "BranchSettings" s WHERE s."branchId" = p_branch));
$$;

-- TG_ARGV[0]: what the row is, for the message ("invoice").
-- TG_ARGV[1]: SQL for the document date (a UTC timestamp) over the row aliased r.
-- TG_ARGV[2]: SQL for the branch id over r (NULL: the company-wide date only).
-- TG_ARGV[3]: comma-separated columns that may not change on a closed row. "col=VALUE" refuses only a
--             change to that value (e.g. status=CANCELLED).
-- Maintenance scripts (never the API) may set app.books_closed_bypass = 'on' for their transaction, for
-- example to load legacy history; the change log flags such changes as made outside the app.
CREATE OR REPLACE FUNCTION books_closed_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_sql        TEXT := format(
        'SELECT ((%s) AT TIME ZONE ''UTC'' AT TIME ZONE ''Africa/Lagos'')::date, (%s)::text FROM (SELECT ($1).*) r',
        TG_ARGV[1], COALESCE(NULLIF(TG_ARGV[2], ''), 'NULL'));
    v_old_date   DATE;
    v_new_date   DATE;
    v_old_branch TEXT;
    v_new_branch TEXT;
    v_lock       DATE;
    v_entry      TEXT;
    v_col        TEXT;
    v_val        TEXT;
    v_old        JSONB;
    v_new        JSONB;
BEGIN
    IF COALESCE(current_setting('app.books_closed_bypass', true), '') = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;
    IF TG_OP <> 'INSERT' THEN EXECUTE v_sql INTO v_old_date, v_old_branch USING OLD; END IF;
    IF TG_OP <> 'DELETE' THEN EXECUTE v_sql INTO v_new_date, v_new_branch USING NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        v_lock := books_closed_up_to(v_new_branch);
        IF v_new_date <= v_lock THEN
            RAISE EXCEPTION 'BOOKS_CLOSED: The books are closed up to %. This % is dated %; a closed period cannot get new entries.',
                to_char(v_lock, 'DD Mon YYYY'), TG_ARGV[0], to_char(v_new_date, 'DD Mon YYYY');
        END IF;
        RETURN NEW;
    END IF;

    v_lock := books_closed_up_to(v_old_branch);
    IF TG_OP = 'DELETE' THEN
        IF v_old_date <= v_lock THEN
            RAISE EXCEPTION 'BOOKS_CLOSED: The books are closed up to %. This % is dated % and cannot be deleted.',
                to_char(v_lock, 'DD Mon YYYY'), TG_ARGV[0], to_char(v_old_date, 'DD Mon YYYY');
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE of a closed row: refuse a change to a guarded column.
    IF v_old_date <= v_lock THEN
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        FOREACH v_entry IN ARRAY string_to_array(TG_ARGV[3], ',') LOOP
            v_col := split_part(v_entry, '=', 1);
            v_val := NULLIF(split_part(v_entry, '=', 2), '');
            IF (v_val IS NULL AND (v_old -> v_col) IS DISTINCT FROM (v_new -> v_col))
               OR (v_val IS NOT NULL AND (v_new ->> v_col) = v_val AND (v_old ->> v_col) IS DISTINCT FROM v_val) THEN
                RAISE EXCEPTION 'BOOKS_CLOSED: The books are closed up to %. This % is dated % and its % cannot change.',
                    to_char(v_lock, 'DD Mon YYYY'), TG_ARGV[0], to_char(v_old_date, 'DD Mon YYYY'),
                    CASE WHEN v_col IN ('cancelledAt', 'reversedAt') OR v_val = 'CANCELLED' THEN 'cancellation' ELSE v_col END;
            END IF;
        END LOOP;
    END IF;
    -- Moving an open row into a closed period.
    IF (v_new_date IS DISTINCT FROM v_old_date OR v_new_branch IS DISTINCT FROM v_old_branch)
       AND v_new_date <= books_closed_up_to(v_new_branch) THEN
        RAISE EXCEPTION 'BOOKS_CLOSED: The books are closed up to %. This % cannot be dated %.',
            to_char(books_closed_up_to(v_new_branch), 'DD Mon YYYY'), TG_ARGV[0], to_char(v_new_date, 'DD Mon YYYY');
    END IF;
    RETURN NEW;
END;
$$;

-- Finance
DROP TRIGGER IF EXISTS "Invoice_books_closed" ON "Invoice";
CREATE TRIGGER "Invoice_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "Invoice" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('invoice', 'r."issuedDate"',
        'COALESCE(r."reportBranchId", (SELECT j."branchId" FROM "JobCard" j WHERE j.id = r."jobCardId"), (SELECT c."branchId" FROM "CounterSale" c WHERE c."invoiceId" = r.id))',
        'issuedDate,customerId,subtotal,tax,total,partsTotal,labourTotal,serviceTotal,partsDiscountPercent,labourDiscountPercent,partsDiscountAmount,labourDiscountAmount,vatRate,vatAmount,roundOff,cancelledAt');

DROP TRIGGER IF EXISTS "Receipt_books_closed" ON "Receipt";
CREATE TRIGGER "Receipt_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "Receipt" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('receipt', 'r."issuedAt"', 'r."branchId"',
        'issuedAt,branchId,customerId,invoiceId,amount,mode,category,bankId,chequeNumber,chequeDate,cancelledAt');

DROP TRIGGER IF EXISTS "Payment_books_closed" ON "Payment";
CREATE TRIGGER "Payment_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "Payment" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('payment', 'r."paymentDate"',
        '(SELECT COALESCE(i."reportBranchId", (SELECT j."branchId" FROM "JobCard" j WHERE j.id = i."jobCardId")) FROM "Invoice" i WHERE i.id = r."invoiceId")',
        'paymentDate,invoiceId,amount,method');

DROP TRIGGER IF EXISTS "PartyNote_books_closed" ON "PartyNote";
CREATE TRIGGER "PartyNote_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartyNote" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('debit/credit note', 'r.date', 'r."branchId"',
        'date,branchId,customerId,direction,type,amount,cancelledAt');

DROP TRIGGER IF EXISTS "PartyAdjustmentBatch_books_closed" ON "PartyAdjustmentBatch";
CREATE TRIGGER "PartyAdjustmentBatch_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartyAdjustmentBatch" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('party adjustment', 'r.date', 'r."branchId"',
        'date,branchId,customerId,amount,reversedAt');

DROP TRIGGER IF EXISTS "ReceiptAllocation_books_closed" ON "ReceiptAllocation";
CREATE TRIGGER "ReceiptAllocation_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "ReceiptAllocation" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('receipt adjustment', 'r."adjustedAt"',
        '(SELECT x."branchId" FROM "Receipt" x WHERE x.id = r."receiptId")',
        'adjustedAt,amount,receiptId,invoiceId,debitNoteId,creditNoteId,batchId,reversedAt');

-- Stock
DROP TRIGGER IF EXISTS "StockTransaction_books_closed" ON "StockTransaction";
CREATE TRIGGER "StockTransaction_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "StockTransaction" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('stock movement', 'r."createdAt"', 'r."branchId"',
        'createdAt,branchId,partId,type,quantity');

DROP TRIGGER IF EXISTS "PartIssuance_books_closed" ON "PartIssuance";
CREATE TRIGGER "PartIssuance_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartIssuance" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('part issue', 'r."issuedAt"', 'r."branchId"',
        'issuedAt,branchId,sparePartId,quantity,jobCardId');

DROP TRIGGER IF EXISTS "PartReturn_books_closed" ON "PartReturn";
CREATE TRIGGER "PartReturn_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartReturn" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('part return', 'r."returnedAt"',
        '(SELECT i."branchId" FROM "PartIssuance" i WHERE i.id = r."partIssuanceId")',
        'returnedAt,partIssuanceId,quantity,rate,amount');

DROP TRIGGER IF EXISTS "CounterSaleReturn_books_closed" ON "CounterSaleReturn";
CREATE TRIGGER "CounterSaleReturn_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "CounterSaleReturn" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('counter sale return', 'r."returnDate"', 'r."branchId"',
        'returnDate,branchId,grossAmount,discountAmount,vatAmount,roundOff,total');

DROP TRIGGER IF EXISTS "MaterialReceiptNote_books_closed" ON "MaterialReceiptNote";
CREATE TRIGGER "MaterialReceiptNote_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "MaterialReceiptNote" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('MRN', 'r."receiptDate"', 'r."receivingBranchId"',
        'receiptDate,receivingBranchId,totalReceived,totalDamaged,totalShort,totalValue');

DROP TRIGGER IF EXISTS "StockTransferNote_books_closed" ON "StockTransferNote";
CREATE TRIGGER "StockTransferNote_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "StockTransferNote" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('STN', 'r."documentDate"', 'r."sourceBranchId"',
        'documentDate,sourceBranchId,destinationBranchId,totalQuantity,totalValue,status=CANCELLED');

DROP TRIGGER IF EXISTS "MaterialInTransit_books_closed" ON "MaterialInTransit";
CREATE TRIGGER "MaterialInTransit_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "MaterialInTransit" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('MIT', 'r."transitDate"', 'r."destinationBranchId"',
        'transitDate,destinationBranchId,totalQuantity,totalAmount,cancelledAt');

DROP TRIGGER IF EXISTS "PartRequisition_books_closed" ON "PartRequisition";
CREATE TRIGGER "PartRequisition_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartRequisition" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('requisition', 'r."requisitionDate"', 'r."branchId"',
        'requisitionDate,branchId,chargeType,cancelledAt');

DROP TRIGGER IF EXISTS "PartReturnSlip_books_closed" ON "PartReturnSlip";
CREATE TRIGGER "PartReturnSlip_books_closed" BEFORE INSERT OR UPDATE OR DELETE ON "PartReturnSlip" FOR EACH ROW
    EXECUTE FUNCTION books_closed_guard('return slip', 'r."returnDate"', 'r."branchId"',
        'returnDate,branchId,cancelledAt');

-- 3. Permission: SuperAdmin only.
INSERT INTO "Permission" ("id", "name", "description", "createdAt")
VALUES (gen_random_uuid()::text, 'books:close', 'Close the books up to a date, and reopen them', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id FROM "Role" r JOIN "Permission" p ON p.name = 'books:close'
WHERE r.name = 'SuperAdmin'
ON CONFLICT DO NOTHING;
