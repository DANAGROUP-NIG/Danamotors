# Issue 117 progress

Plan: M1 permissions and seed regression; M2 permission-based job detail scope; M3 additive version/signature schema; M4 immutable revisions; M5 signed decisions and integrity gate; M6 isolated print; M7 runbook and verification. Commit each milestone locally. Never push or access a non-local database.

- [x] M1 Permissions: 85 role/action and repeated-seed tests passed. Existing job-bill route uses its own permission. System Node executable required because default nvm shim has no active version.
- [x] M2 Job detail scope: two nested-data visibility tests passed; service defaults to no financial access.
- [ ] M3 Schema
- [ ] M4 Revisions
- [ ] M5 Signatures
- [ ] M6 Print
- [ ] M7 Documentation and verification

Defaults: WorkshopManager creates first estimates and prints, without signing. ServiceManager revises/prints/signs without creating. BillingOfficer remains home-branch only, without estimate access. View-only callers receive operational fields without prices. Remote signatures deferred. Account creation is a runbook only. Existing estimate number/date fields from #79 will be reused.
