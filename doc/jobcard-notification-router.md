# Jobcard notifications

## Issue 140 reliability review

The existing transactional outbox and worker now also handle PART_REQUESTED,
PARTS_ISSUED, PARTS_UNAVAILABLE and PART_RECEIVED. Business transactions enqueue
deterministic `workshop:job:event:occurrence` records; they never create the in-app
message directly. Requisitions queue their request/issue/availability events with
the stock write, and collection queues its event with signed collection evidence.
Failures to enqueue roll back the business transaction rather than losing its event.
Delivery failures after commit leave the business write intact and use the existing
retry/failure/Admin alert/replay flow. No second queue, migration or dependency is added.

The job's Request part button keeps its own branch-only store-manager rule, active
recipient validation, actor exclusion, stable request UUID and first-request timestamp.
Its API/toast now confirm queuing rather than claiming completed delivery. Formal
requisition requests preserve their existing General Store Manager recipients.
Issued/received notifications preserve advisor/technician recipients; unavailable
parts notify the advisor. Ready jobs retain existing request-only behavior. Requests
that become billed, delivered or cancelled before delivery are suppressed and audited.

Workers acquire the job lock before the event lock, matching producer order. Recipient
messages, delivery audit and the processed marker commit together. Existing notification
dedupe keys remain compatible with old deliveries, including on replay. Failure recording
also locks/rechecks the event so a competing successful worker is not followed by a
false Admin failure alert.

Promised reminders remain opt-in with JOB_PROMISED_REMINDERS_ENABLED=true and retain
the configured working-hour policy. TODO(confirm): whether these optional reminders
should bypass working hours needs a separate business decision. Outside working hours,
deferred timer rows are excluded from ordinary outbox selection so they cannot block
parts, assignment or QC delivery. Disabling promised reminders also defers already queued
promised events without blocking other work.

An upcoming working job receives a stable reminder per promised date/window. Status
and assignment changes do not invalidate the promised date; delivery resolves the current
action owner. Changed promises, finished work and expired deadlines suppress obsolete
reminders. Recovery inside 12 hours sends the 12-hour reminder instead of sending both
missed windows at once, and an old pending 24-hour reminder is suppressed once the
12-hour window supersedes it. No reminder is sent for READY, BILLED, delivered or
cancelled work. Customers/email are not added to the current owner routing.

Reminder selection reads 100-job pages, fetches latest workflow occurrences in one
parameterized DISTINCT ON query per page, and inserts all due events with one deduplicated
createMany. Parts events do not reset workflow-action reminder age. Existing job/event
indexes are reused; no cache or new index is asserted necessary without a local EXPLAIN.
PostgreSQL JSON timestamps without a zone are interpreted using the existing UTC storage
convention, then formatted for Africa/Lagos. Messages use readable statuses/dates and omit
raw actor/job UUIDs from ordinary workflow copy.

Validation is scoped to notification policy/router/outbox, request/collection producers,
OpenAPI and the touched hook. Local integration tests are guarded to the disposable
localhost notification_staging database and remain skipped without that configuration.
No external database, email or real recipient was contacted. See issue-140-progress.md
for actual command results and remaining live-validation limits.

Implemented on `feat/jobcard-notification-handoffs`. Apply the additive migration
`20261112120000_jobcard_notification_router` and generate the Prisma client before
starting the backend. Existing schema startup checks require the new tables.

## Audit before changes

All existing jobcard notifications used in-app only. Canonical statuses were
OPEN, IN_PROGRESS, WAITING_PARTS, QC, READY, BILLED, DELIVERED and CANCELLED.
Assignment and QC results were separate fields. Legacy aliases Pending/Open,
In Progress/On Hold, Quality Check, Ready/Completed, Billed, Closed and Cancelled
remain normalized without changing workflow transitions or permissions.

| Event | Existing recipients | Finding |
| --- | --- | --- |
| Created unassigned | None | Assignment handoff missing |
| Created assigned / assignment | Technician | Technician-ID key suppressed A  to  B  to  A |
| OPEN  to  IN_PROGRESS | None | Work-start notification missing |
|  to  WAITING_PARTS | Advisor | Store owner missed |
| WAITING_PARTS  to  IN_PROGRESS | None | Resume handoff missing |
| IN_PROGRESS / WAITING_PARTS  to  QC | Inspector plus all QC-capable branch users | Broadcast exceeded assigned owner |
| QC PASSED | Advisor / branch advisors | Owner generally correct |
| QC FAILED | Technician and advisor | Workshop Manager missing |
| QC  to  IN_PROGRESS | None | Relied on previous failure send |
| QC  to  READY | Advisor, CCU, portal customer, separate Billing Officers send | Scattered action/FYI sends, billing lacked dedupe |
| READY  to  BILLED | None | Delivery handoff missing |
| READY / BILLED  to  DELIVERED | None | Closure FYI missing |
| OPEN / IN_PROGRESS / WAITING_PARTS / QC / READY  to  CANCELLED | None | Cancellation FYI missing |
| Estimate revision READY  to  QC | None | Implicit transition bypassed notifications |
| Parts/labour READY  to  IN_PROGRESS | Some separate parts notifications | Reopened-work handoff inconsistent |
| Bill cancellation  to  READY | None | Rebilling handoff missing |
| Promised delivery in 24 / 12 hours | Advisor, technician, active portal customer | Optional broadcast, no status-age escalation |

Trigger sites were workflow/workshop services, inventory/requisition services
and the optional promised-reminder scheduler. Estimate, labour and billing
writers could change state outside those hooks. No jobcard notification database
trigger existed in the searched migrations. Recipient-resolution failures emitted
warnings, persistence made three total attempts before warning, and empty/missing
recipients could silently drop. There was no actor exclusion, Admin fallback,
durable failure record or structured channel delivery audit. Message context was
incomplete. Local `debug.log` had no matches for the searched failure markers;
hosted runtime logs were unavailable, so successful delivery could not be inferred.

## Final routing matrix

| Event | Action recipients | FYI recipients |
| --- | --- | --- |
| Created unassigned | Branch Workshop Manager and Service Advisors | - |
| Created assigned / technician changed | Assigned Technician | - |
| OPEN  to  IN_PROGRESS | Assigned Technician | Assigned Service Advisor |
|  to  WAITING_PARTS | Branch Store Officers | Assigned Service Advisor |
| WAITING_PARTS  to  IN_PROGRESS | Assigned Technician | - |
|  to  QC, including estimate revision | Assigned Inspector; QC-permission branch users only if unassigned | - |
| QC PASSED | Assigned Service Advisor, otherwise branch advisors | - |
| Inspector reassigned / QC reset while awaiting inspection | Assigned Inspector, otherwise branch QC-permission users | - |
| QC FAILED / QC  to  IN_PROGRESS | Technician, Service Advisor, Workshop Manager | - |
|  to  READY | Branch Billing Officers | CCU Officers and active portal customer |
| READY  to  BILLED | Delivery Advisor, otherwise Service Advisor/branch advisors | - |
|  to  DELIVERED / CANCELLED | - | Requester (creator), Workshop Manager, Service Advisor |
| READY  to  IN_PROGRESS, including parts/labour changes | Assigned Technician | - |
| BILLED  to  READY (bill cancelled) | Billing Officers and Service Advisor; rebilling may be needed | - |

Assigned Service Advisor falls back to branch advisors when unassigned. Missing
active users for a target fall back to branch Admin/SuperAdmin, then global
Admin/SuperAdmin, and emit a warning. An assigned but inactive inspector falls
back to Admin; it does not broadcast to QC staff. Actors are excluded, including
when they also hold another target role. Overlapping recipients get one combined
message per event, with action intent taking precedence over FYI.

## Capture and delivery

A deferred database trigger captures JobCard creation and changes to status,
technician, inspector or QC result in `jobcard_notification_events`. It commits with the
business transaction. No screen is responsible for detecting transitions. The
router normalizes aliases and ignores note-only edits and unchanged assignments
or QC results. Each committed assignment gets an occurrence ID, so A  to  B  to  A
produces three handoffs. Assignment/QC controllers pass transaction-local actor
context; other status changes use the transaction's status-history actor.
Parts/labour and estimate writers also propagate actor context for QC resets
that do not change the main jobcard status.

The worker polls every minute. Primary workflow and legacy workshop notification
entry points also drain their jobcard after commit. Changes from estimates,
billing and parts/labour writers are therefore delivered within a polling cycle.
Obsolete action notifications are suppressed if the card already moved on; FYI
messages remain deliverable. No historical events are backfilled as transitions.

Persistence, delivery audit and the processed marker commit atomically under an
outbox row lock. Dedupe includes jobcard, event type, occurrence and recipient.
The old separate billing send is replaced by the Ready route and its dedupe key.
Separate actual parts and warranty events retain their original behavior.

Initial delivery plus three retries use 100/500/1500 ms backoff. Exhausted events
create `notification_failures`, alert Admin and record failure/delivery audit.
If the database or Admin alert is unavailable, a warning is emitted and the event
remains pending. Failure records survive an unsuccessful Admin alert. Once fixed,
operations can explicitly call `replayJobcardNotification(eventId)`; original
dedupe keys prevent delivery duplication. No public replay endpoint was added.

`jobcard_notification_audit` records jobcard, event/occurrence, recipient,
in-app channel, delivery/suppression/failure status and timestamp. Notification
rows themselves provide the persisted message and direct link.

## Reminders

Settings are centralized in `jobcard-notification-policy.ts`:

| Setting | Default |
| --- | --- |
| JOB_NOTIFICATION_REMIND_HOURS | 4 |
| JOB_NOTIFICATION_ESCALATE_HOURS | 8 |
| JOB_NOTIFICATION_TIMEZONE | Africa/Lagos |
| JOB_NOTIFICATION_WORK_START / WORK_END | 8 / 18 |
| JOB_NOTIFICATION_WORK_DAYS | 1,2,3,4,5 (Monday-Friday) |
| JOB_PROMISED_REMINDERS_ENABLED | Existing opt-in `true` enables 24/12-hour reminders |

TODO(confirm): confirm working days/hours and holiday requirements. Thresholds
count elapsed hours; delivery waits until a working period. Remind once per
action occurrence and escalate once to Workshop Manager. QC PASSED waits on the
advisor, QC FAILED waits on rework owners, and terminal states receive no timers.
Promised reminders target current action owners rather than broadcasting to
customers. If delivery approaches outside working hours, a still-upcoming
deadline can be reminded on the next working sweep; an expired promise is not
sent as an upcoming-delivery reminder.

TODO(confirm): creator is the requester because there is no dedicated requester
field. Priority is explicitly “not recorded” because JobCard has no priority
field. Portal customers without active accounts cannot receive in-app messages.
Channel preferences and quiet hours are a follow-up, explicitly outside this pass.

## Verification

Use Node 22.23.2 already installed at
`C:/Users/Emma/AppData/Local/Author Software/nvm/installs/v22.23.2/node.exe` when
the nvm shim has no selected version. No dependencies were added.

The integration test requires an explicitly supplied `TEST_DATABASE_URL` whose
host is localhost/127.0.0.1 and database name is `notification_staging`. It never
uses the normal app connection to write fixtures. Synthetic accounts are disabled
test identities. A disposable PostgreSQL instance on localhost:55439 was used.
The application schema was bootstrapped locally, then the exact additive SQL
migration was applied over the baseline tables.

Staff links resolve to the existing `/job-cards/[id]` page; portal links resolve
to `/portal/service-history/[id]`. No browser/dev server was run. UI navigation,
signed-in access, a hosted staging deployment and real-time multi-hour operation
are not verified by the database integration test.

## Files changed

- `server/jest.config.js` (resolve Node16-style relative `.js` imports in TypeScript tests)
- `server/prisma/schema.prisma`
- `server/prisma/migrations/20261112120000_jobcard_notification_router/migration.sql`
- `server/src/modules/notification/jobcard-notification-policy.ts`
- `server/src/modules/notification/jobcard-notification-router.ts`
- `server/src/modules/notification/jobcard-notification-policy.test.ts`
- `server/src/modules/notification/jobcard-notification-router.test.ts`
- `server/src/modules/notification/jobcard-notification.integration.test.ts`
- `server/src/modules/notification/workshop-notifications.ts`
- `server/src/modules/notification/workshop-notifications.test.ts`
- `server/src/modules/notification/promised-reminders.ts`
- `server/src/modules/service/job-card-workflow.service.ts`
- `server/src/modules/service/service.service.ts`
- `server/src/modules/service/service.controller.ts`
- `server/src/modules/service/labour.service.ts`
- `server/src/modules/workshop/workshop.service.ts`
- `server/src/modules/workshop/workshop.controller.ts`
- `server/src/modules/requisition/requisition-work.ts`
- `server/src/modules/inventory/inventory.service.ts`
- `doc/jobcard-notification-router.md`
- `doc/progress/jobcard-notification-handoffs-progress.md`

`notification.service.ts` and pre-existing invoice/receipt edits were preserved.

## Final test results

- Focused final run: **6 suites, 68 tests passed**, including **7 committed local
  PostgreSQL staging cases**. Covers every routing row, A  to  B  to  A, legacy aliases,
  QC rejection/rework/reset/reassignment, cancellation, empty-role fallback,
  actor exclusion, retry/replay idempotency, shortened timers, promised reminder
  markers, rollback safety, accurate UTC capture, nested-history actors and a
  database-injected send failure with durable record/Admin alert.
- Full backend run: **100 suites / 1,167 tests passed; 26 suites / 186 tests
  skipped**. One policy suite hit a mixed-version TypeScript diagnostic because
  the full run began before the inspector-reassignment event was added. Its
  isolated, cache-free rerun passed **all 31 tests**. The full suite was not
  repeated, per the repository's testing guardrail.
- Backend `tsc --noEmit` (both the typecheck and lint script), final `tsc` build,
  Prisma schema validation and `git diff --check` passed.
- The exact additive SQL migration applied successfully on the disposable local
  staging database. The trigger uses UTC capture timestamps independently of the
  database's Africa/Lagos timezone.
- Staff and customer notification links were asserted against the correct route
  paths. Authenticated browser navigation was not run.
- A broader existing `workshop.integration.test.ts` service flow was attempted.
  Jest's `.js` mapping was fixed, but the flow remains blocked by its outdated
  estimate-approval fixture: `addApproval` omits the current required version/hash
  and returns “Estimate changed; reload the signature summary”. Workflow/signature
  rules were deliberately left intact. This is **not a verified full API/UI E2E**.
- No hosted staging deployment, production access, real customer notifications,
  hosted runtime-log review or multi-hour wall-clock soak was performed.
- The installed Node 22.23.2 binary ran all checks. The sandbox's nvm shim cannot
  access the host selection, so commands used the binary directly. Host nvm
  reports Node 22.23.2 selected.
- Prisma generation reported a locked existing query-engine DLL. Generated client
  types/runtime were usable and verified by the build and staging tests; the
  installed DLL hash matches the bundled Prisma engine. Run normal generation
  after stopping the process holding the DLL before deploying a fresh checkout.
- No new dependencies were added. Channel preferences and quiet hours remain a
  follow-up. The disposable database is stopped and its test files removed after
  validation; no non-local database was written.
