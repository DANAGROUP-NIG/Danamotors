# Promised date minimum

- Preserve the minimum of the day after the appointment date, or opening date for walk-ins, using Africa/Lagos.
- Replace the opening form's native date picker with the existing DayPicker library. Earlier dates are disabled and visibly muted; calendar navigation starts at the minimum month.
- Use a calendar-only selection to prevent typed dates bypassing the minimum. Check the same minimum on submission, including existing values and appointment changes.
- Preserve the existing working changes in the opening form and UI helpers. No new dependencies, database writes, browser runs or commits.
- Validation: scoped ESLint, frontend TypeScript check, editor diagnostics and whitespace checks.
- Time highlight follow-up: focused hour, minute and AM/PM fields now use the same primary background and foreground tokens as the selected calendar date. Fixed the missing space between concatenated classes. Scoped ESLint and editor diagnostics passed.
- Native-popup correction: the field CSS cannot style the browser-owned popup shown in the supplied screenshot. Replaced the promised-time native input with a controlled hour/minute/AM-PM picker, using the calendar's selection tokens. Submission still uses HH:mm. Removed ineffective native pseudo-element styling. Conversion regression tests cover all 1,440 minutes plus noon/midnight and AM/PM changes; scoped ESLint passed.
- Final checks: frontend typecheck, two time-conversion tests, scoped ESLint and editor diagnostics passed. Selected hours/minutes scroll into view. No visual/browser validation was run.
