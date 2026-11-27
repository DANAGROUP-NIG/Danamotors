# Issue 144 booking customer details

## Before the change

- Prisma stored optional email, phone, address and postal code. A unique index protected email. TIN and NIN had no columns. Legacy data and direct seed writes could omit all these fields.
- Staff customer create and update used the customer Zod schema. Email was optional, trimmed and lowercased. Phone was required on creation and had a length check. Address and postal code were optional. Client customer forms mirrored the general rules. Portal profile, registration and legacy data transfers had their own validation or writes.
- The appointment screen opened the walk-in modal and posted to the staff appointment endpoint. The shared customer picker offered quick-create for the appointment and staff enquiry approval. It collected names, optional email, phone and optional address. Existing customer selection performed no completeness check.
- Staff appointments, enquiries, customer portal, campaign, CSC and PSF reached the central booking transaction. Direct seed and report-fixture writes used Prisma. The customer detail page read the customer detail endpoint. The job card read a curated customer projection from the service repository.
- The database change-log trigger recorded changed columns generically. The request audit redacted top-level sensitive keys.

## Implementation

- Reuse the existing customer and vehicle selectors, Field, Button, ModalFame, toast feedback and responsive grid. Inline completion has loading, retry, field errors and disabled submission. The profile and job card reuse DetailField and inherit existing access controls.
- Keep the new columns nullable and apply one shared format rule when creating bookings. Complete incomplete customer records inside the existing booking transaction. Branch-scoped staff can complete records for their branch.
- Use either identifier. Validate format only, with the provisional TIN format isolated. Email is always required at booking. Format validation accepts domestic or +234 phone input and normalizes new booking contact numbers to domestic form.
- Add permission-scoped displays. Exclude identifiers from database change logs and redact nested request audit values.

## Verification

- Full backend run passed 1,843 tests. The default run skipped 318 database-dependent cases. The final local PostgreSQL run passed 59 focused cases across booking, migration and audit coverage.
- Applied the migration and replayed it twice with a customer row present. The customer and nullable identifiers were preserved. Verified atomic rollback, email conflict, a UTF-8 address round trip and redaction in the database change log and request audit.
- Customer profile and job-card API smoke checks returned both identifiers for a role with customer-read access. The job-card visibility test verified that access is enforced.
- Backend and frontend TypeScript checks passed. Frontend Webpack production build passed. ESLint reported warnings and zero errors. Client tests passed 90 of 91, including both quick-create tests. The existing issue 117 component test failed resolving its `./BillHeads` import.
- The UI diff scan found zero pictographs, decorative glyphs, replacement characters, question-mark placeholders, raw missing-value or enum strings, hard-coded colors or sizes, browser dialogs, and em or en dashes.
- The local preview started, and the API smoke check passed through its proxy. Brave computer-use approval timed out. Desktop and mobile layout, interaction states, keyboard operation, contrast and print rendering remain unverified.

## Startup schema repair

- A read-only catalog comparison confirmed eight missing JobCard columns and three missing Inspection columns on the configured database. The startup message previously stopped after ten names and omitted Inspection.status.
- The forward repair restores the eleven columns with the Prisma types and defaults. It gives existing inspections empty findings where that required column was absent, while leaving findings required on new writes. The repair and re-run passed on populated disposable PostgreSQL tables.
