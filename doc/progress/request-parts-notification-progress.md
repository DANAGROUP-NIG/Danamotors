# Request Parts notification

## Plan
1. Replace the jobcard scroll handler with a mutation and pending/success/error feedback.
2. Add a permission- and branch-checked notification endpoint using the existing PART_REQUESTED message builder.
3. Notify active StoreOfficer users in the jobcard branch only; do not create or issue parts or change jobcard state.
4. Test recipients, closed/billed guards and retry deduplication; run scoped checks.

TODO(confirm): StoreManager means the existing branch store role (`ROLES.BRANCH_STORE_MANAGER`, stored as `StoreOfficer`). If no eligible branch store user exists, report an error instead of notifying another role. Preserve actor exclusion.

Pre-existing staged receipt and notification.service.ts changes remain outside this task.

## Updated requirement
Issuing against a jobcard now requires a successful Request Parts click first. Add `partsRequestedAt` via an additive migration and commit its first value atomically with branch-store notifications. Enforce the marker in both legacy inventory issuance and requisition issuance; unissued requisitions and part returns remain allowed. Existing jobcards are not automatically marked requested. One successful request unlocks issuance for that jobcard (TODO(confirm): no per-part or per-issuance request approval was specified).

## Completed
- Replaced scrolling with a pending-disabled mutation, branch-store notification feedback and jobcard query refresh.
- Added `POST /service/job-cards/:id/request-parts`, with existing issuance/return permissions and branch ownership checks. Reuses the existing PART_REQUESTED message builder and recipient dedupe constraints; excludes the actor and other branches/roles.
- Request notification and first-request marker are atomic. Missing recipients or failed persistence return an error and do not unlock issuance.
- Added migration `20261113090000_jobcard_parts_request` and UI gates for direct issuance and the requisition panel. Both server issuance paths enforce the same pure guard before stock writes.
- 17 new tests passed; 37 existing inventory/requisition tests passed (54 total). Scoped server/client typechecks, affected client ESLint, Prisma generation/validation and whitespace checks passed.
- No browser/dev server or full suite was run for this targeted change. No database was migrated or written; apply the additive migration to dev/staging before using the feature.
- Preserved staged service/receipt edits; notification.service.ts SHA256 remains `C4F599B2986805E7B0B9AA2BEF3859AA599B072D68F963E2B022BFD5D4DEE8A9`. No commit or push for this change.
