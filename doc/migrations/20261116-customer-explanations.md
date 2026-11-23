# Customer service explanations

Apply `20261116150000_customer_service_explanations` before deploying the new
application and regenerate Prisma Client. It adds nullable TEXT `customerRemarks`
to JobCard and Estimate, with idempotent ADD COLUMN statements. No business-data
backfill is needed: existing rows retain null, and internal remarks stay private.
No indexes are added because reads use existing document primary keys.

This separates #113's customer explanations from #117's internal notes. Existing
`remarks` and `workDone` retain their meanings. The remarks API still requires its
original `remarks` key; optional `customerRemarks` is preserved when omitted and
cleared with null or blank text. Both fields have a 5000-character boundary limit.
The same permission and branch checks apply, with atomic old/new audit values.

Customer explanations remain editable after approval or billing. They are live
explanatory metadata outside the estimate's signed financial scope; they do not
change lines, amounts, version, approval or invoice totals. Customer prints show
the explicitly entered explanation. Internal remarks and part-source data remain
excluded from customer estimate projections.

Rollback application code while retaining the nullable columns, entered values
and audit history. Older code ignores the new fields. Do not drop the columns or
reset document/financial records to roll back this feature. Re-enabling the UI
later will reveal the saved explanations again.

Local verification covers repeat application over historical rows, null public
defaults, unchanged internal text/work done/amounts, terminal-state editing,
branch denial, no-op saves, audit rollback, signed-estimate hash preservation,
billed-job projection and plain-text escaping. No remote database is used.
