# Booking transaction optimization

- Scope: booking creation and shared booking relation existence reads. Branch: `fix/booking-transaction-duration`.
- Retained vehicle row lock, duplicate check under the lock, transactional sequence allocation, and atomic booking/request/audit writes.
- Removed redundant vehicle existence query; validation reads select IDs only. Pure status/date preparation and response totals run outside the transaction.
- Booking creation timeout is scoped to 10 seconds; acquisition wait and global transaction defaults are unchanged. Existing slow-query logging remains available for diagnosis.
- Validation: backend `tsc --noEmit` passed; focused booking logic/persistence suites passed. Final persistence rerun passed all 4 tests, including audit failure (8 passing tests across the two suites). `git diff --check` passed.
- Added real-database audit-failure rollback coverage alongside existing duplicate-creation coverage. Integration tests skipped (13 tests): disposable localhost `TEST_DATABASE_URL` is unset. No database writes were performed.
- Default Node launcher is unconfigured; checks used the existing `C:/Program Files/nodejs/node.exe` directly, without changing runtime configuration.
- Trade-offs: existence reads return fewer columns and one fewer query, but relation checks remain transactional to preserve behavior; timeout relief can hold locks longer under sustained slowness. No measured latency improvement is claimed without a local database benchmark. Shared sequence numbering remains a serialization point.
