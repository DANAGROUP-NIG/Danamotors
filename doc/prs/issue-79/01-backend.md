# Add workshop monthly reporting APIs and billing foundations

Workshop staff need ten monthly report datasets with branch permissions and consistent financial rules. Add report endpoints, corporate maintenance, booking/estimate dimensions and default-off parts VAT with immutable new-invoice breakdowns. Keep existing invoice amounts unchanged and PDI history permission-scoped.

Includes four additive migrations and the corrected Engineer Role.updatedAt insert. For a previous failed dimensions migration, mark it rolled back before retrying deployment; see the import guide in the final PR.

Validation: backend typecheck and 48 test suites passed (636 tests); 10 database suites/39 tests skipped because a test database is unavailable. Live migrations and legacy SQL parity remain unverified. Parts VAT stays off pending acceptance.

Base: DevPastey. Related to #79; this PR does not complete live QA.
