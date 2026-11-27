# Booking transaction optimization

## Linked job progress

- Appointment details refresh every 15 seconds while open. The tracker uses the linked service workflow stage, with job-card status as the fallback for legacy cards. Delivery completes the tracker; quality check rework moves it back to In Repair.
- Legacy appointments with multiple linked jobs follow the least advanced non-cancelled job. All-cancelled jobs display a separate stopped state.
- Two progress tests and two repository tests passed. Changed lines passed the scan for disallowed glyphs, malformed copy, raw rendered values, hard-coded colour and pixel values, and browser dialogs. Live database and desktop or mobile browser verification were unavailable.

## CCU vehicle check-in

- The appointment tracker marks Checked In complete and highlights Inspection after check-in. Rendered markup checks covered Pending, Checked In, Inspection and Cancelled. Browser layout and contrast were not verified.
- Increased the appointment update transaction timeout from 5 to 15 seconds, matching the service job-card transactions. The vehicle mileage, appointment status and audit entry are still committed together.
- All 21 booking logic tests passed. The 22 booking integration tests were skipped because a disposable localhost test database was unavailable.
- Diff check passed. Backend typecheck reported TS6059 in the existing service job acceptance test, which imports a Prisma seed file outside the configured source root.

- Scope: booking creation and shared booking relation existence reads. Branch: `fix/booking-transaction-duration`.
- Retained vehicle row lock, duplicate check under the lock, transactional sequence allocation, and atomic booking/request/audit writes.
- Removed redundant vehicle existence query; validation reads select IDs only. Pure status/date preparation and response totals run outside the transaction.
- Booking creation timeout is scoped to 10 seconds; acquisition wait and global transaction defaults are unchanged. Existing slow-query logging remains available for diagnosis.
- Validation: backend `tsc --noEmit` passed; focused booking logic/persistence suites passed. Final persistence rerun passed all 4 tests, including audit failure (8 passing tests across the two suites). `git diff --check` passed.
- Added real-database audit-failure rollback coverage alongside existing duplicate-creation coverage. Integration tests skipped (13 tests): disposable localhost `TEST_DATABASE_URL` is unset. No database writes were performed.
- Default Node launcher is unconfigured; checks used the existing `C:/Program Files/nodejs/node.exe` directly, without changing runtime configuration.
- Trade-offs: existence reads return fewer columns and one fewer query, but relation checks remain transactional to preserve behavior; timeout relief can hold locks longer under sustained slowness. No measured latency improvement is claimed without a local database benchmark. Shared sequence numbering remains a serialization point.
