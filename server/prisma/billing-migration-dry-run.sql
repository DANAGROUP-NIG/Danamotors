-- Read-only preflight for 20260928130000_job_billing_receipts_tally/migration.sql.
-- Run against a production snapshot before applying the migration.

SELECT
  (SELECT count(*) FROM "Invoice") AS existing_invoices,
  (SELECT count(*) FROM "Invoice" WHERE "jobCardId" IS NOT NULL AND upper(status) NOT IN ('CANCELLED', 'CANCELED', 'VOID')) AS active_job_bills,
  (SELECT count(*) FROM (
    SELECT "jobCardId"
    FROM "Invoice"
    WHERE "jobCardId" IS NOT NULL AND upper(status) NOT IN ('CANCELLED', 'CANCELED', 'VOID')
    GROUP BY "jobCardId"
    HAVING count(*) > 1
  ) AS duplicate_job_bills) AS job_cards_with_multiple_active_bills,
  (SELECT count(*) FROM "Payment") AS existing_payments,
  (SELECT count(*) FROM "Receipt") AS existing_receipts,
  (SELECT count(*) FROM "Payment" AS payment
    WHERE payment."recordedById" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Receipt" AS receipt
        WHERE receipt."invoiceId" = payment."invoiceId"
          AND receipt.amount = payment.amount
          AND receipt."issuedAt" = payment."paymentDate"
      )) AS payment_rows_to_convert,
  (SELECT count(*) FROM "Payment" AS payment
    WHERE payment."recordedById" IS NULL
  ) AS payment_rows_without_recorder,
  (SELECT count(*) FROM "Payment" AS payment
    JOIN "Receipt" AS receipt
      ON receipt."invoiceId" = payment."invoiceId"
     AND receipt.amount = payment.amount
     AND receipt."issuedAt" = payment."paymentDate"
  ) AS payment_rows_matching_existing_receipts,
  (SELECT count(*) FROM "Payment" AS payment
    JOIN "Receipt" AS receipt
      ON receipt."invoiceId" = payment."invoiceId"
     AND receipt.amount = payment.amount
     AND receipt."issuedAt" <> payment."paymentDate"
  ) AS same_amount_receipts_with_different_timestamps,
  (SELECT count(*) FROM (
    SELECT payment."invoiceId", payment.amount, payment."paymentDate"
    FROM "Payment" AS payment
    JOIN "Receipt" AS receipt
      ON receipt."invoiceId" = payment."invoiceId"
     AND receipt.amount = payment.amount
     AND receipt."issuedAt" = payment."paymentDate"
    GROUP BY payment."invoiceId", payment.amount, payment."paymentDate"
    HAVING count(DISTINCT payment.id) <> count(DISTINCT receipt.id)
  ) AS ambiguous_matches) AS ambiguous_payment_receipt_match_groups,
  (SELECT COALESCE(sum(payment.amount), 0) FROM "Payment" AS payment
    JOIN "Invoice" AS invoice ON invoice.id = payment."invoiceId"
    WHERE payment."recordedById" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Receipt" AS receipt
        WHERE receipt."invoiceId" = payment."invoiceId"
          AND receipt.amount = payment.amount
          AND receipt."issuedAt" = payment."paymentDate"
      )) AS amount_to_convert_without_recorder;

-- Review invoice/receipt/payment identifiers and dates for any exceptions before deployment.
SELECT payment.id AS payment_id,
       payment."invoiceId",
       payment.amount,
       payment."paymentDate",
       payment."recordedById",
       receipt.id AS matching_receipt_id,
       receipt."receiptNumber"
FROM "Payment" AS payment
LEFT JOIN "Receipt" AS receipt
  ON receipt."invoiceId" = payment."invoiceId"
 AND receipt.amount = payment.amount
 AND receipt."issuedAt" = payment."paymentDate"
ORDER BY payment."paymentDate", payment.id;
