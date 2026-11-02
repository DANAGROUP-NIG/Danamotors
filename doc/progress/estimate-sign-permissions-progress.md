# Estimate sign permissions

- Found `estimate:sign` already granted to ServiceAdviser in backend `ROLE_PERMISSIONS`; the approval endpoint requires that permission.
- Added an additive, repeatable migration to backfill the permission and grants for the four roles with this default. Existing custom grants are preserved.
- Added regression coverage for ServiceAdviser authorization and migration parity with seed defaults.
- Validation: both targeted regression tests passed; scoped TypeScript check passed with the Express request type augmentation included. No database changes executed.
- Follow-up: frontend sign visibility uses API-supplied permissions; AuthProvider refreshes them through the current-user endpoint on page reload. Signing also requires an open, unbilled job, a latest estimate with no previous decision, and the editor to be closed.
- The configured database is non-local (checked without exposing credentials). Applying the migration is prohibited by the repository's non-local database write guardrail. No database query or write was performed; temporary local verification script removed.
- Revision follow-up: `estimate:revise` has the same missing migration despite being present in ServiceAdviser defaults. Added a separate additive migration so databases that already applied the sign migration receive revision grants too. All four targeted tests and the scoped TypeScript check passed. No database writes performed.
