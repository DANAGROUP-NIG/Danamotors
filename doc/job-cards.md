# JobCard database and workflow

The generated Prisma client and database must use the same migrations. A missing
`JobCard.billedAt` column means the billing migration has not been deployed.
From `server`, run `npm run prisma:deploy`, then `npm run prisma:generate` before
starting the server. Do not reset the database or remove the Prisma field.

`20260928130000_job_billing_receipts_tally` adds the column and the related labour,
invoice and receipt structures used by JobCard details. It also converts existing
payments to receipts; run `prisma/billing-migration-dry-run.sql` before deploying
to another environment and review duplicate bills and ambiguous receipt matches.

Job cards use title-case statuses, including Open, In Progress, Ready and Completed.
The list and repairs filters share these values. Ready and Completed cards can be
billed; an existing active bill prevents creating a second bill. Billed cards cannot
be edited. Appointment-based creation inherits its customer and vehicle and checks
that the branch and vehicle ownership match.

Verification: run `npm test -- --runInBand` and `npm run typecheck` in `server`, and
`npx tsc --noEmit --incremental false` in `client`.
