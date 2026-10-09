-- Read-only: run on a production snapshot before 20261008120000_party_adjustments.
BEGIN TRANSACTION READ ONLY;
SELECT COUNT(*) FILTER (WHERE "creditBalance">0) AS credit_wallets,
 COUNT(*) FILTER (WHERE "creditBalance"<0) AS debit_wallets,
 COALESCE(SUM(GREATEST("creditBalance"::numeric,0)),0) AS wallet_credit,
 COALESCE(SUM(ABS(LEAST("creditBalance"::numeric,0))),0) AS wallet_debit
FROM "Customer";
SELECT status,COUNT(*) AS receipts,COALESCE(SUM("advanceAmount"::numeric),0) AS existing_advances FROM "Receipt" GROUP BY status;
-- Resolve these currency errors before applying the migration; no implicit rounding correction is made.
SELECT id,code,"creditBalance" FROM "Customer" WHERE "creditBalance"::text IN ('NaN','Infinity','-Infinity')
 OR ABS("creditBalance"::numeric-ROUND("creditBalance"::numeric,2))>0.000001;
SELECT id,"customerId",amount,status FROM "CustomerCreditApplication" WHERE status='Approved'
 AND (amount::text IN ('NaN','Infinity','-Infinity') OR amount<0.01 OR ABS(amount::numeric-ROUND(amount::numeric,2))>0.000001);
SELECT id,"receiptNumber",amount,"advanceAmount" FROM "Receipt" WHERE status='ACTIVE' AND ("advanceAmount"::text IN ('NaN','Infinity','-Infinity') OR "advanceAmount"<0 OR "advanceAmount">amount OR ABS("advanceAmount"::numeric-ROUND("advanceAmount"::numeric,2))>0.000001);
SELECT id,"receiptId","invoiceId",amount FROM "ReceiptAllocation" WHERE amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity');
SELECT a.id,a."invoiceId",a.amount,i.total,i."outstandingAmount",a."decisionDate",
 (SELECT COUNT(*) FROM "Payment" p WHERE p."invoiceId"=a."invoiceId" AND p.method='Credit' AND p.reference='CREDIT-'||UPPER(LEFT(a.id,8))) AS matching_payments
FROM "CustomerCreditApplication" a JOIN "Invoice" i ON i.id=a."invoiceId" WHERE a.status='Approved';
-- Stored historical outstanding may predate the phase 1 fix. Review/repair in phase 5 before reversing legacy batches.
SELECT i.id,i."invoiceNumber",i.total,i."outstandingAmount",
 COALESCE((SELECT SUM(a.amount) FROM "ReceiptAllocation" a JOIN "Receipt" r ON r.id=a."receiptId" WHERE a."invoiceId"=i.id AND r.status='ACTIVE'),0) AS receipt_allocations,
 COALESCE((SELECT SUM(a.amount) FROM "CustomerCreditApplication" a WHERE a."invoiceId"=i.id AND a.status='Approved'),0) AS approved_credit
FROM "Invoice" i WHERE EXISTS (SELECT 1 FROM "CustomerCreditApplication" a WHERE a."invoiceId"=i.id AND a.status='Approved');
COMMIT;
