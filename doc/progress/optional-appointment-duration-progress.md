# Optional appointment duration

- Existing feature branch: `DevPastey`. Preserved earlier edits.
- Cause: numeric coercion converted the empty form input to zero, which failed positive-number validation.
- Create and update validation now map an empty duration to undefined, so JSON omits it. Supplied durations still require positive whole minutes. The create form labels duration optional; the API already permits omission.
- Form input types now distinguish blank duration input from parsed numeric output in create and legacy edit forms.
- Validation passed: all 4 focused schema regression tests, client TypeScript check, scoped ESLint and git diff --check. No database writes or browser runs performed.
