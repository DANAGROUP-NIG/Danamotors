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


# FRONTEND / UI QUALITY STANDARDS (MANDATORY)

The UI must look like a finished, professionally designed internal business application used daily by service advisors, store managers, technicians, and finance staff. It must not look AI-generated. Treat every screen as production work.

## Phase 0 additions (recon)
- Inspect the existing frontend before designing anything: component library, design tokens (colors, spacing, typography, radii, shadows), icon set, form components, table components, modal/dialog, date picker, toast/notification, empty/loading/error patterns, and layout shell. List what you found.
- Reuse these. Do not introduce a second component library, a second icon set, or new one-off styles. If something needed is missing, extend the existing system in the same style.

## Phase 1 additions (plan)
For every screen or component you will touch, the plan must include:
- Which existing components you will reuse and which (if any) you must add
- States covered: loading, empty, error, validation error, disabled, success, and permission-denied
- How it behaves on small screens and at the app's supported breakpoints
- Any screenshot or visual verification you will do (see Visual verification)

## Hard rules: forbidden
1. **No emojis anywhere** in the UI, labels, buttons, toasts, table cells, empty states, tooltips, logs shown to users, or documentation screens. No emoji as icons, bullets, or status markers.
2. **No Unicode symbols used as icons or decoration**: no checkmarks, crosses, arrows, bullets, stars, warning triangles, or similar glyphs typed as text characters. Use the project's icon set (SVG icons) only.
3. **No stray `?`, `�`, `□`, or mojibake characters** (e.g. "â‚¦", "Ã©"). Treat any appearance of these as a bug.
4. **No question marks as placeholders, fallbacks, or "unknown" markers.** Missing values show a proper em-dash-free fallback such as "Not provided" or a muted "N/A", chosen consistently across the app. Never render "undefined", "null", "NaN", "[object Object]", or raw enum/database values (like `IN_PROGRESS` or `jobCardId`) to users. Map them to readable labels via a single shared mapping.
5. **No decorative filler**: no gradient hero banners, glassmorphism, random drop shadows, neon colors, or oversized rounded cards unless they already exist in the design system.
6. **No placeholder or lorem text**, no "Click here", no vague labels ("Submit", "Done") where a specific one is possible ("Save booking", "Send to QC").
7. **No fake data or hardcoded sample values** left in components.
8. **No em dashes or en dashes in user-facing copy.** Use plain commas, periods, or hyphens.
9. **No browser `alert()`, `confirm()`, or `prompt()`.** Use the app's dialog and toast components.
10. **No text-only validation dumps** ("An error occurred"). Errors must name the field and the fix.

## Hard rules: required
1. **Icons**: use only the existing icon library, consistently sized and aligned with text. Icon-only buttons need an accessible label and a tooltip.
2. **Encoding**: UTF-8 end to end (HTML meta charset, API responses, database connection and collation, any PDF/print template, any email template). Verify that special characters survive a full round trip: save, read back, display, and print.
3. **Currency and numbers**: format money with `Intl.NumberFormat` using locale `en-NG` and currency `NGN` (₦), through one shared formatter. Verify the ₦ sign renders correctly on screen, in print, and in PDFs, and that the font in use contains the glyph or a safe fallback exists. Right-align numeric columns, use tabular numerals, and show consistent decimal places. Never format money by string concatenation.
4. **Dates and times**: one shared formatter, Africa/Lagos timezone, consistent format across the app. No raw ISO strings shown to users.
5. **Typography and spacing**: use the design tokens only. Consistent type scale, consistent vertical rhythm, aligned form labels and inputs, no cramped or uneven spacing. No hard-coded pixel or hex values where a token exists.
6. **Forms**: clear labels (not placeholder-only), required markers, inline field-level errors beside the field, helper text where the rule is not obvious, sensible tab order, correct input types and masks, and submit buttons that show a loading state and prevent double-submit. Modals must keep user input and close only on explicit cancel or close, never on outside click when a form is open.
7. **Tables and lists**: sensible default sorting, aligned columns, truncation with tooltip for long text, pagination, a proper empty state with a helpful next action, and skeleton or spinner loading states that match the layout.
8. **Status**: use consistent status badges driven by one mapping (label, color, meaning), not ad-hoc text or colors per screen.
9. **Feedback**: toasts for success and failure with specific wording, confirm dialogs for destructive actions that name what will be affected.
10. **Accessibility**: sufficient color contrast, visible focus states, full keyboard operation, semantic HTML, labels tied to inputs, and meaningful aria attributes. Do not convey status by color alone.
11. **Responsive**: no horizontal overflow, no clipped modals, usable on the smallest supported viewport.
12. **Print views** (job card, signed job card, picking list, invoices): clean print stylesheet, correct page breaks, no screen-only chrome, ₦ and special characters rendering correctly, and signature and date areas clearly laid out.

## Copy and microcopy
- Plain, specific, professional wording, written for Nigerian automotive service staff. No jargon, no cutesy tone, no exclamation marks, no emojis.
- Labels, buttons, headings, and messages use consistent terminology across the app (use the same word for the same thing everywhere; follow the issue's own terms such as "Request part", "Part received", "READY").
- Use sentence case consistently, matching the existing app.

## Visual verification (required before a slice is declared done)
- Run the app and check every touched screen in light of the rules above. If you can capture screenshots, do so for each state (loading, empty, error, filled, disabled) and at desktop and mobile widths, and include them in the slice summary.
- If you cannot run the app or take screenshots, say so explicitly and list what you could not verify. Do not claim the UI is polished without checking it.
- Run a final scan of changed files and fail the slice if any of these are found:
  - Emoji or pictographic characters
  - The characters `�` or `?` used as UI placeholders
  - Common mojibake patterns
  - Raw enum values, "undefined", "null", or "NaN" reachable in rendered output
  - Hard-coded colors or sizes that bypass design tokens
  - `alert(`, `confirm(`, `prompt(`
  Report what the scan checked and its actual result.

## Definition of Done additions (per slice, UI)
- [ ] Reuses existing components, tokens, and icon set. Nothing new introduced without justification
- [ ] Zero emojis, text-glyph icons, stray `?`/`�`, or raw enum/null values in the UI
- [ ] All states implemented (loading, empty, error, validation, disabled, permission-denied)
- [ ] Currency, date, and special characters verified on screen, in print, and in exports
- [ ] Responsive and keyboard-accessible, with contrast checked
- [ ] Visual verification evidence (screenshots or an explicit statement of what could not be verified)