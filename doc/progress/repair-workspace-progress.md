# Repair workspace presentation update

Rebuilt the estimate workspace at the top of the existing job-card detail route. Existing job details, mutation handlers, signature dialog, permission checks and print routes remain available. No backend changes or dependencies.

Shared presentation: RepairWorkspacePage, WorkspaceHeader, StatusPill, JobProgressStepper, EstimateApprovalCard, EstimateLinesTable, ApprovalCallout and MoneyDisplay. Copy and pure view/status/money helpers have separate files. Latest estimate is prominent; earlier revisions and their signature evidence remain under history. No backend totals are recomputed. The current line contract has no note field, so secondary lines use the existing kind/inclusion flag.

Palette: primary/primary-foreground for actions and active step; existing amber-50/200/700 for pending states; emerald-50/200/700 for approval; red-50/200/700 for decline/invalid; muted/muted-foreground for secondary text and table heading; border/card/background for surfaces. No new tokens, hex values or dependencies.

Status aliases reuse canonicalJobStatus: Open/Pending -> Open; In Progress/On Hold -> In progress; Quality Check -> QC; Ready/Completed -> Ready; Billed -> Billed; Closed -> Delivered. CANCELLED has no current workflow step and is labelled Cancelled. No backend status changes.

Validation: helper/state/permission/print regression tests; frontend full lint, typecheck and build. Final visual review used an isolated static render of test API-shaped data with the production Tailwind CSS at 375/768/1280px: no page-level horizontal overflow, table and stepper scroll only within their cards. Screenshots and measured widths are in ignored .audit-local/repair-workspace-visual. This validates presentation; a logged-in live-backend end-to-end flow was not run. Product data continues to come exclusively from useJobCard and the existing APIs; test fixtures are confined to client/test.

Final results: 8 focused frontend checks passed; full frontend lint passed with 0 errors (71 existing warnings), full typecheck passed, production build passed, and git diff --check passed.
