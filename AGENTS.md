# Agent guardrails

## Token and credit efficiency
- Read the task once. Do not re-read files or re-fetch issues already read this session.
- Find code with grep/ripgrep, then read only the relevant line ranges, not whole files.
- Never print large outputs. Pipe through head, tail or grep.
- Plan in 10 lines or fewer, then execute. Track progress in the task's progress doc at milestones only.
- Prefer targeted edits over rewriting files. Batch related file writes in one step.
- Copy existing patterns in the repo instead of exploring alternatives.
- Keep chat updates to one or two lines. Put detail in the progress doc or final report.
- If the same error survives 3 fix attempts, stop, note what was tried, and move to independent work.
- No screenshots, dev server or browser runs unless a visual result can't be verified another way.

## Tests and checks
- During development run only affected test files and a scoped typecheck.
- Use quiet output: pipe through `tail -n 25` or grep for FAIL and summary lines. Never print full passing logs.
- On failure, rerun only the failing file. Use --bail where supported.
- Run the full backend suite, typecheck, lint and build at most once per milestone and once at the end.

## Code standards
- Follow existing conventions. Reuse components, hooks, utilities and types before creating new ones.
- No new dependencies without a written justification. Pin exact versions at least 14 days old.
- Strict TypeScript, no `any`, no dead code, no console logs.
- Business logic goes in pure, tested functions. UI components stay presentational. Data fetching stays in hooks.
- Use existing Tailwind tokens only. Do not add colours or hex values.
- Money uses the existing decimal helpers, never floats.
- Migrations must be additive. Role permission changes go in ROLE_PERMISSIONS, because the seed resets them.

## Safety
- Work on a feature branch. Do not push, merge, open a PR or close issues unless asked.
- Never write to a non-local database.
- No passwords, secrets or real personal accounts in code, seeds or docs.
- Flag ambiguous business rules with `TODO(confirm)` and a safe default instead of stopping to ask.