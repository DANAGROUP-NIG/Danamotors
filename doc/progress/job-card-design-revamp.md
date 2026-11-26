# Job card detail redesign

## Audit and implementation

The route at `client/app/(dashboard)/job-cards/[id]/page.tsx` uses `useJobCard(id)`, query key `jobCardKeys.detail(id)`, and `getJobCardRequest` to unwrap `{ jobCard: JobCard }` from `GET /service/job-cards/:id`. The repair workspace reads the same cached query. The API gates estimates and financial data, and existing permission checks gate actions.

The dashboard supplies the sidebar, header, typography and color tokens. The route reuses Button, StatusBadge/StatusPill, Lucide, LoadingSkeleton, Field, NumberInput, WorkshopPicker, the existing table and overflow patterns, Sonner feedback, and existing signing dialogs and native date inputs. Native disclosures are scoped to the detail page. The header, summary grid and the workspace/context layout stack as available width decreases. Tables and the progress strip scroll within their own regions.

## Field mapping

| Mockup element | Data source | Display |
| --- | --- | --- |
| Job number, description, created date | `jobNumber`, `description`, `createdAt` | Text, wrapped description, Lagos date/time |
| Status and progress | `status`, `repeatRecord.status` | Shared status labels, tones, lifecycle mapping and repeat tag |
| Header work and billing actions | `status`, `allowedTransitions[]`, `canStartWork`, `openingSignatureRequired`, `openingSignatureCurrent`, `estimates[0].status`, `estimates[0].approvals[].signatureState`, `billedAt`, `invoices[].status`, `creditApprovedById`, `gatePassNumber` and permissions | Existing eligibility and mutations in Workshop actions, original gates for printing, part request and billing |
| Opening consent | Opening consent query `state`, `signature.signerName`, `signature.signedAt`, `signature.revision`, `signature.id` | Shared consent status, Lagos time, original reload, sign and print |
| Estimate approval warning | `estimates[0].status`, `estimates[0].approvals[].signatureState`, bill and permissions | Warning with link to the estimate when approval is required |
| Summary metrics | `estimatedCost`, `advanceSummary.receivedAmount`, `advanceSummary.balanceAmount`, `advanceSummary.basis`, `qcStatus` | NGN from source amounts, invoice balance label when billed, shared QC labels |
| Service transactions header | `jobNumber`, `vehicle.registrationNumber`, `vehicle.vin`, `vehicle.model`, `vehicle.trim`, `mileage`, `id` | Text and authenticated picking-list link |
| Requisition and saved documents | `partsRequestedAt`, `branchId`, `id`, `campaigns[]`, requisition query and picker results | Existing requisition form, charge and assignment controls, saved slip paging, issue and print |
| Returns | Requisition query `requisition.lines[]`, `quantityRequired`, `quantityIssued`, `returns[]`, `rate`, `partSource`; saved return slips | Existing return limits, quantities and NGN rates, human-readable charge/source labels |
| Labour | Labour slip queries, `labourLines[].description/hours/rate/amount/labourItem/technician/mechanic`, catalogue and assignment pickers | Existing recorded order, hours, NGN, and add/edit controls |
| Remarks | Remarks query `document.remarks`, `document.customerRemarks`, `document.context`; selected estimate or job | Original editable values and document context, Lagos dates, missing-value copy |
| Estimate and approval | `estimates[].version/status/currency/items/parts/labours/subtotal/tax/total/approvals` through the existing estimate view model | Original revision order, server totals, NGN or server currency, signature evidence and print |
| Advance payments | `advanceSummary.total/receivedAmount/paidPercent/balanceAmount/excessAmount/suggestedPercent`, `advanceReceipts[].receiptNumber/advanceAmount/status/mode/issuedAt` | Existing summary, receipt list, receipt picker and attachment |
| Diagnosis and findings | `complaints[].defectCode/description`, `observations`, `workDone`, `qcNotes`, existing workshop form state | Wrapped notes, empty request state, original editable controls |
| Activity | `statusHistory[].toStatus/createdAt/actor/remarks` | Existing response order, human-readable status and Lagos time, empty timeline |
| Customer | `customer.companyName/firstName/lastName/phoneNumber/email/id` and category helper | Display name, optional contact, shared category label and profile link |
| Vehicle | `vehicle.year/make/model/registrationNumber/vin/color` | Text, plate treatment and missing-value fallback |
| Assignment | `createdBy`, `serviceAdvisor`, `deliveryAdvisor`, `technician`, `qualityInspector`, `team.description`, `branch.name`, `updatedAt` | Names, Lagos time and assignment fallbacks |
| Specifications | `service.name` or `serviceType.description`, `bay.description`, `appointment.scheduledAt`, `promisedAt`, `readyAt`, `mileage`, `estimatedHours`, `acFitted`, `inHouse`, `qcStatus`, `qcNotes` | Lagos dates, mileage in km, nullable yes/no, QC label and notes |
| Cost breakdown | `estimatedParts`, `estimatedOil`, `estimatedLabour`, `serviceCharge` | Server amounts, NGN and missing-value fallback |
| Warranty and campaigns | `warrantyStatusAtCreation`, `warrantyReasonsAtCreation`, `warrantyExpiresOnAtCreation`, `warrantyKmLimitAtCreation`, `warrantySnapshot`, `warrantyCase`, `campaigns[]` | Original permission-gated cards, case links and campaign actions |
| Issued parts, collection and payer | `partIssuances[].quantity/returns/sparePart/issuedBy/partSource`, parts receipt and collection state, job-card lines query | Existing collection/return and allocation controls, issuance order, net retail value as a separate display calculation |
| Additional records | `tyres[]`, `batteryMake`, `batteryNumber`, `customField1`, `checklist`, `remarks`, `customerRemarks`, `inspections[]`, `invoices[]`, `gatePassNumber`, `deliveredAt`, repeat and late-delivery panels | Existing details and print access; invoice totals are the returned totals and the rollup excludes void/cancelled invoices |

## Integration and scope

- Opening consent and estimates keep their own queries and signature mutations. Workshop changes keep PUT `/service/job-cards/:id`, technician assignment keeps POST `/workshop/assign/:id`, and QC keeps PATCH `/workshop/qc/:id`. Credit approval, campaign updates, payer allocation, requisitions, returns, labour, remarks, request-part and deposit attachment retain their existing handlers.
- Print and gate-pass actions continue to call browser print. Signed documents, estimates and picking lists continue to navigate to their existing print routes.
- Prototype theme/sidebar/search controls use the current dashboard shell. Prototype-only activity events, sample assignments, fabricated amounts and client-side mutations are omitted. The activity timeline shows recorded status history. The real estimate workflow stays visible as its own workspace section. Start work remains in the existing Workshop actions form.
- Existing business fields stay visible in their respective sections. Permission-filtered amounts display the missing-value state when no value is provided.

## Manual QA

Use a local or approved test environment and a job with many lines and long descriptions, a sparse new job without optional details, a job awaiting consent and an advance, a job with an approved estimate, a read-only account, and a delivered job with a gate pass. Check at 375px, tablet and desktop widths. Verify horizontal scroll stays within tables, tab keyboard navigation, validation and pending controls, consent/estimate signing, status changes, parts/labour, print layouts and the NGN glyph. Compare the summary metrics and invoice totals with the API values. Verify failure and retry by interrupting the local API.

## Verification result

Frontend TypeScript and the production build (`next build --webpack`) passed. Full lint reported zero errors and 74 repository warnings. Scoped lint passed. All 89 frontend tests passed after adding the existing `BillHeads` component to the invoice-print test loader. The fix is test-only. An unauthenticated local request to the detail route returned HTTP 307. Browser access timed out on the first attempt and the browser host was unavailable on retry, leaving responsive rendering, console output, print preview, currency glyph rendering and the full save/read/print round trip unverified.
