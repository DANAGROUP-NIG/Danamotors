# Job card workflow audit

Phase 0 complete. Findings reflect the current feature branch, including existing local edits. No application or database changes were made.

## Story gaps

| Step | Implemented | Existing path | Gap to close |
| --- | --- | --- | --- |
| 1. Verify faults and open from appointment | Partial | `service.routes.ts`, `JobCardWorkflowService`, `JobCardOpeningModal`, `JobCardCreateForm`, `JobComplaint` | Appointment link is optional and complaints, observations and opening consent serve separate purposes. Record explicit verification remarks, actor and time, and require them for newly opened service jobs. |
| 2. Assign Technician | Partial | `WorkshopService.assignTechnician`, `JobCardLabourSection`, job detail and labour writes, notification `ASSIGNED` | Dedicated assignment already validates active same-branch Technician. Apply shared rules to other assignment writes, stop reassignment once work is complete, notify both Technicians and retain history. |
| 3. Submit inspection to Warranty Officer | Partial | `POST /service/job-cards/:id/inspections`, `ServiceService.addInspection`, Prisma `Inspection` | Generic findings and notes exist. Add assigned-Technician submission, catalogue parts and quantities, explicit no-parts confirmation, stage advancement and the Warranty Officer handoff. Existing warranty notification on opening has a different purpose. |
| 4. Resolve or bypass warranty | No | Existing warranty coverage checks and warranty job billing | Coverage is already modelled for other purposes. Add a decision per submitted part, resolution metadata, an audited bypass behind one flag and an integration path for future decisions. |
| 5. Prepare estimate | Partial | `POST /service/job-cards/:id/estimates`, `ServiceService.addEstimate`, `JobCardEstimateSection` | Require warranty resolution, notify the adviser and seed parts from the inspection. Preserve estimate revisions, signatures and advances. |
| 6. Approve estimate and hand off to Workshop Manager | Partial | `estimate-approval.ts`, service and portal decision paths, `estimate-advance.ts` | Preserve customer approval rules. Route each accepted decision through the workflow and notify Workshop Managers once. |
| 7. Request parts | Partial | `POST /service/job-cards/:id/request-parts`, `jobcard-parts-request.service.ts`, Part Requisition panel | Request timestamp and branch-store outbox already exist. Require approved scope and Workshop Manager authority, include quantities, and deduplicate by workflow occurrence rather than a fresh request ID. |
| 8. Issue parts | Partial | `RequisitionService`, direct inventory issuance, `PARTS_ISSUED` outbox event | Keep stock, substitutions and returns logic. Apply the same workflow guard to every issuance path and distinguish partial issuance from fulfilled scope. |
| 9. Finish work and send for QC | Partial | `job-transitions.ts`, `JobCardWorkflowService`, status notification router | Current status map permits several workshop roles to move a job into QC. Require the assigned Technician and fulfilled approved parts scope for new jobs. Notify QC Officers and the adviser. |
| 10. Record QC result | Partial | `WorkshopService` QC action, `QCSTATUS_UPDATE`, `qcStatus`, `qcNotes`, existing audit action | Add QC Officer role, require remarks, preserve each attempt with actor/time, and atomically enter rework on failure. Existing flow records the outcome in QC and handles rework separately. |
| 11. Mark Ready for Billing | Partial | `QC → READY` in `job-transitions.ts` and `JobCardWorkflowService`, billing notification policy | Existing transition is Service Adviser-only and checks QC Passed. Reuse it in the common action contract and verify billing recipients and link. |
| 12. Bill and receipt | Partial | `JobBillingService`, `receipt.service.ts`, `InvoiceDetailPage`, `ReceiptDocument`, portal invoice detail | Keep posting and receipt allocation. Persist zero-value warranty invoice lines with explicit provenance, omit them from printed itemization, and show them at zero in the portal. |

## Lifecycle and legacy mapping

`JobCard.status` is a Prisma string, with a legacy default of `Open`. The transition table and canonicalizer live in `server/src/modules/service/job-transitions.ts` and `job-card-workflow.service.ts`. QC and estimates have their own status fields.

| Current canonical status | Aliases accepted by the workflow canonicalizer | Proposed workflow interpretation for existing cards |
| --- | --- | --- |
| `OPEN` | `Open`, `Pending` | Opened. Existing Technician assignment and actual estimate/request/issuance records identify milestones when present. |
| `IN_PROGRESS` | `In Progress`, `On Hold` | In Progress. Preserve the ability to finish work under legacy rules. |
| `WAITING_PARTS` | None | Waiting for parts. Preserve issue and resume actions. |
| `QC` | `Quality Check` | Awaiting QC, QC Passed, or QC Failed, based on the separate QC outcome. |
| `READY` | `Ready`, `Completed` | Ready for Billing. |
| `BILLED` | `Billed` | Billed. Read receipt/payment state from finance records. |
| `DELIVERED` | `Closed` | Delivered. Preserve existing finance handling for delivered cards, including the legacy unbilled case. |
| `CANCELLED` | `Cancelled` | Cancelled and terminal. |

Keep the public lifecycle strings and derive finer stages from workflow evidence. New stage sequence is Opened, Technician Assigned, Inspection Submitted / Awaiting Warranty, Warranty Resolved or Bypassed, Estimate Prepared, Estimate Approved, Parts Requested, Parts Issued, In Progress, Awaiting QC, QC Passed or Rework, Ready for Billing, and Billed / Receipted. Keep delivery and cancellation as existing lifecycle outcomes. Use an explicit workflow version or opt-in marker for strict sequencing, with no bulk update or fabricated legacy milestones. Flag unrecognized legacy values for review and retain existing read access.

## Enforcement, roles and audit

- Extend the current transition definition and reuse existing endpoint contracts. Apply the same policy within transaction boundaries at opening, generic job updates, assignment/labour writes, estimate create/revise and staff/customer decisions, Request Parts, requisition and direct issuance, QC, and finance billing. Existing row locks help serialize writes. Add an optimistic version check and occurrence identity so stale writes and retries have distinct outcomes.
- Reuse `JobCardStatusHistory` for lifecycle transitions and extend audit coverage to actions that leave the public status unchanged. Existing QC notes and audit events do not provide a structured history of every attempt.
- `ROLES` and `ROLE_PERMISSIONS` in `server/src/shared/constants/roles.ts` are the source of role defaults. The seed reconciles grants from that map. ServiceAdviser, WorkshopManager, Technician, WarrantyOfficer and BillingOfficer exist. StoreOfficer and GeneralStoreManager are the existing branch and general store roles. No QC Officer role was found. Add `QCOfficer` using the Service Adviser grants as a baseline plus QC permissions. The user create/edit forms source choices from the roles API. Confirm branch scope, menu access, and action-level role enforcement separately from baseline read permissions.

## Notifications and pricing

- `jobcard-notification-router.ts`, `jobcard-notification-policy.ts` and `workshop-notification-outbox.ts` already support durable in-app delivery, branch-aware recipient lookup, dedupe keys, delivery audit, retry and replay. The client consumes notification records through React Query. Extend the existing outbox and routing with workflow occurrence IDs, tab links and event payloads. Review existing actor suppression, fallback recipients and stale-action suppression against the story so required handoffs arrive once, including when a recipient performed the action.
- Existing assignment targets the new Technician. QC pending targets the assigned inspector or users with QC permission. QC Passed targets the adviser and Technician. QC Failed targets the Technician, adviser and Workshop Manager. Ready already targets billing. Parts events already use the durable outbox. Align these with the requested recipient lists and add inspection, warranty resolution and estimate approval handoffs.
- `ServiceService.addEstimate` resolves the selected `SparePart` record by ID and reads `retailRate`. Source variants are separate catalogue records. Preserve server calculation and snapshot the catalogue rate when warranty sets the payable rate to zero.
- `JobBillingService.getBillLines` derives actual lines from issuance/returns and recorded labour. Its pricing scope reconciles approved estimates and currently filters by customer-paid scope. Carry warranty provenance into invoice lines and avoid classifying a line by zero price alone, since service-package inclusions can also cost zero.
- Staff invoice printing runs through `client/features/invoices/components/InvoiceDetailPage.tsx`. Payment receipt printing runs through `ReceiptDocument.tsx` and shows payment/allocation information. Customer invoice detail runs through `client/app/portal/invoices/[id]/page.tsx` and the customer-scoped `PortalRepository.findInvoice`. Add a single print-line projection for customer itemization and expose approved warranty lines to the portal with a clear label.

## Frontend inventory and plan

The dashboard layout and route guards already provide the shell. Job detail, `RepairWorkspacePage` and `ServiceTransactions` host the relevant workspaces. Reuse the existing Tailwind theme in `globals.css` for color, spacing, typography, radius and shadow, with Lucide, Button, Card, Badge/StatusBadge, field/input/select, DateInput/DateTimeInput, ModalFame, toast provider, LoadingSkeleton and table empty/pagination patterns.

| Surface | Reuse and additions | States and responsive checks |
| --- | --- | --- |
| Appointment opening and Labour | Existing forms, Technician picker, modal and field errors. Add verification remarks and server-driven assignment availability. | Loading and retry, empty Technician list, field validation, disabled pending or blocked action, success and read-only permissions. Stack form controls on narrow widths. |
| Job detail and repair workspace | Existing tabs, cards and status UI. Add step tracker, next action, inspection/warranty panels, QC form and history using one workflow hook. | Loading, empty, errors and retry, field validation, in-flight locks, success feedback and permission-aware views. Stack stages, keep tab navigation keyboard-accessible and verify dialogs fit 375px. |
| Estimate, requisition, billing and customer views | Existing panels, tables, print documents and formatting. Add warranty badges, actionable reasons and portal line itemization. | Loading, empty, errors, relevant field validation, pending actions, success and read-only views. Check narrow table layouts and print output. |

In Phase 2, verify touched screens at desktop and 375px in light mode and capture evidence where available. Check keyboard navigation, field errors, contrast, disabled explanations, print and portal output, and NGN and Lagos formatting. Phase 0 used static inspection only.

## Assumptions for Phase 1

- Strict sequencing applies to new service job cards. Keep PDI and existing service cards on their compatible paths. Apply existing branch access throughout.
- Require affirmative no-parts confirmation. For approved zero-parts jobs, record that parts fulfilment is not required and allow work without an empty requisition. For other jobs, work requires the approved scope to be fulfilled, taking substitutions and returns into account.
- Allow bypass for Warranty Officer, Service Adviser, Workshop Manager and existing Admin scopes, subject to the flag and branch access. Keep existing vehicle warranty coverage and claims intact.
- QC failure returns the job to rework and opens a new QC attempt after the Technician completes work again. Keep assignment history and notify the prior and new Technician when reassigning before the first work completion.
- Preserve the stored customer approval, revision, finance and receipt contracts. Review how an estimate revision invalidates downstream milestones before making it actionable for strict jobs.

## Phase 1 checkpoint

- Added the workflow and inspection part tables, with a role migration and matching seed defaults for QC Officer.
- Added a policy for the proposed transitions and a branch-scoped inspection and temporary bypass API. The two writes check the stage, actor and workflow version in a transaction, record an audit row and enqueue in-app delivery. Immediate matching retries return the recorded result.
- Enrollment is off by default. The backend enrollment switch is `SERVICE_JOB_WORKFLOW_ENABLED=true`, and the temporary bypass uses `SERVICE_JOB_WARRANTY_BYPASS_ENABLED=true`. Keep enrollment off until the complete flow is verified. Existing cards and PDI retain their existing path.
- Connected opening with appointment and fault-verification checks, assignment and reassignment, estimate creation and signed approval, parts requests and issuance, work progression, QC and rework, and bill creation and cancellation. Issuance checks net quantities when recording fulfilment. Warranty pricing stores zero-value estimate and invoice lines, snapshots the catalogue rate, exposes customer-safe line items to the portal and provides a filtered invoice print projection.
- Added branch-scoped workflow history and stage-based action availability. Deep links and customer itemization require the corresponding frontend changes. Work checks net quantities again after returns or requisition cancellation. The real warranty integration needs a caller and per-line resolution input. Remaining backend verification includes strict-path retries across existing write endpoints, precondition reasons in the action read, and full notification delivery and routing.
- Prisma client generation succeeded. The migration was not applied. End-to-end behaviour has yet to be verified.
