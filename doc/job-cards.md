# JobCard database and workflow

The generated Prisma client and database must use the same migrations. A missing
`JobCard.billedAt` column means the billing migration has not been deployed.
From `server`, run `npm run prisma:deploy`, then `npm run prisma:generate` before
starting the server. Do not reset the database or remove the Prisma field.

`20260928130000_job_billing_receipts_tally` adds the column and the related labour,
invoice and receipt structures used by JobCard details. It also converts existing
payments to receipts; run `prisma/billing-migration-dry-run.sql` before deploying
to another environment and review duplicate bills and ambiguous receipt matches.

New job cards use `OPEN → IN_PROGRESS → QC → READY → BILLED → DELIVERED`,
or `CANCELLED` before billing. Job-card list filters include legacy aliases such as
Ready and Completed. An existing active bill prevents creating a second bill.
Billed cards allow delivery only; delivered and cancelled cards remain closed.

Opening from an appointment prefills customer, vehicle and the existing service.
The appointment's vehicle and branch must match. Vehicle lookup searches all
vehicles, and changing the bill-to customer preserves the vehicle and booking;
it does not change ownership. Recent jobs use `JOB_REPEAT_WINDOW_DAYS`; repeats
require a previous job and reason. Saving opens the new card's detail page.

Delivery requires a bill or admin credit approval, a delivery advisor and, after
the promised time, one to six late-delivery reasons. Delivery generates a gate
pass with a separate print action. Jobs delivered on approved credit remain
billable; subsequent billing preserves their delivered status and gate pass.
The service catalog and service-type behavior remain unchanged.

Verification: run `npm test -- --runInBand` and `npm run typecheck` in `server`, and
`npx tsc --noEmit --incremental false` in `client`.
