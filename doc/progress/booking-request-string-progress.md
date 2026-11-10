# Booking request string

- Working on existing feature branch `DevPastey`; creation of a separate branch was declined. Preserved existing edits.
- Replaced the booking request list with one textarea and string form/payload types for create and edit.
- API create/update accepts a trimmed, nonempty string (max 2000 characters), rejects arrays, and maps it to one existing request description for persistence. The database description is already a String; no migration or database write is needed.
- Legacy response rows remain compatible with conversion; existing descriptions populate the single textarea. Unchanged text is omitted on edit to preserve existing estimates and codes.
- Validation passed: 19 tests across booking logic, persistence and OpenAPI suites; client and backend TypeScript checks; scoped frontend ESLint; git diff --check. Persistence mapping was tested with mocks; no database writes or browser runs were performed.
