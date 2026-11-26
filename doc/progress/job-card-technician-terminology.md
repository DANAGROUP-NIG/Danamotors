# Job Card technician terminology audit

Line numbers refer to the pre-edit sources.

| File and line | Current field or text | Job Card related | Action | Reason |
| --- | --- | --- | --- | --- |
| JobCardCreateForm.tsx:389,1238,1321; job-card.schema.ts:14; job-card.api.ts:47 | Disabled picker, reset, help and create payload for engineerId | Yes | DELETE legacy create field; RENAME help and add the supported Technician selection | Job Card create accepts technicianId separately. |
| JobCardEditForm.tsx:57,106,264 | Engineer picker and PUT field beside technician assignment | Yes | DELETE | Existing workshop assignment owns technicianId. |
| JobCardLabourSection.tsx:51; SavedSlip.tsx:13 | Technician and older employee names | Yes | LEAVE fallback data; prefer Technician | One displayed assignee and historical names remain readable. |
| LabourPanel.tsx:15–19; TransactionFields.tsx:15 | Slip-header Engineer and line Technician | Yes | DELETE header field from labour | Line assignment remains authoritative. |
| RequisitionPanel.tsx:18,23; TransactionFields.tsx:15 | Optional Engineer on requisition | Yes | RENAME | Requisition has only the historical engineerId slot. Backend accepts an active branch user. |
| LabourLineEditor.tsx:14–17; SavedLabourLine.tsx:50; transaction.logic.ts:147–161 | Employee mechanic choice and technician login choice | Yes | DELETE choice for new lines; RENAME legacy editor label | Existing employee-backed lines preserve their identifier and remain editable. |
| OpeningRepeatCheck.tsx:88; JobCardRepeatPanel.tsx:71; RepeatReviewPage.tsx:125,262; RepeatJobsPage.tsx:90 | Engineer and Mechanic summaries | Yes | RENAME or DELETE duplicate | Prefer returned technician values and use historical names where needed. |
| JobCardEditForm.tsx:403; JobCardLatePanel.tsx:21 | Stored late reason description | Yes | RENAME at display | Preserve reason ID, stored description and reporting values. |
| server/prisma/schema.prisma:735,1826,4880,4972,5072; service.validation.ts:159,237,390 | Stored relations and request fields | Yes | LEAVE | Compatibility fields, indexes, and response shapes remain supported. |
| server/src/modules/service/labour.service.ts:105; requisition.service.ts:178; labour-slip.service.ts:347 | Assignment validation messages | Yes | RENAME wording | Preserve error classes, conditions and API fields. |
| doc/job-cards.md:268,368,388–402,459; client/test/service-transactions-ui.test.mjs:275 | Workflow instructions and rendered UI assertions | Yes | RENAME | Document the new controls and retained compatibility keys. |
| Staff roles, employee administration, PDI, standalone reports, historical seed and migrations, archived design prototype | Existing job titles, historical fixtures or unrelated workflows | No or shared outside this slice | LEAVE | Scope is Job Card workflow and its integrated panels. |

## Compatibility and manual checks

- Job Card opening sends optional `technicianId`. Editing uses the existing Technician assignment action. Service Job Card create and edit no longer send the separate `engineerId`.
- Requisitions still send `engineerId` when a technician is selected. Labour-slip headers stop sending the optional legacy key. New labour lines send `technicianId`; historical employee-backed edits keep the existing `mechanicId` contract. Repeat views use `engineer` and `previousEngineer` only when the response lacks a technician name.
- Keep legacy fields readable until a separately approved migration can map employees without logins, reconcile duplicate assignments, backfill repeat snapshots and introduce versioned aliases for API clients.
- In a local test environment, create a job with and without a technician, convert a booking, change the assigned technician, open a legacy job, and compare the detail and print views. For parts and labour, save a requisition with a technician, record a new labour line and open and edit a saved employee-backed line. Check repeat and late-delivery summaries. The main Job Card response does not return a legacy named assignee for the Job Card header itself, so a job without a canonical technician displays the existing unassigned state there.

## Verification

Frontend build, frontend and backend TypeScript, scoped frontend lint, all 89 frontend tests, 15 targeted backend unit tests and git diff whitespace checks passed. The final terminology sweep leaves compatibility keys, legacy fallback reads, the stored late reason matcher and out-of-scope uses. Authenticated browser access was unavailable in this workspace, so live create, edit, legacy record display and print preview still need manual verification.
