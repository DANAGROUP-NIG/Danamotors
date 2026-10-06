# Workshop: customers, vehicles and job cards

Issue: [#67](https://github.com/DANAGROUP-NIG/Danamotors/issues/67).

## Workflow

1. An administrator maintains **Settings → Workshop Masters** and **Model labour rates**. Codes are plain strings; deactivation preserves references. The vehicle hierarchy is make → product → model → variant, with colours attached to the model. Reparenting is disallowed because it would change existing vehicles and labour rates.
2. Customers are shared across branches; `branchId` is their home branch. Individuals require first/last names; other customer types require a company name. Corporate salutations are saved as `M/S.`. Mobile is required; email is optional and stored as `NULL` when absent. A portal login still requires an email.
3. Customer codes are generated from the initial letter plus a sequence. Admins can supply legacy codes. Duplicate name/mobile matches are advisory, and the form links to matching customers. An admin can merge a duplicate into a kept record: operational and financial references move, balances combine, the old portal login is disabled, and the source identity and audit record remain. Conflicting Tally mappings must be resolved first.
4. Vehicles are selected from the catalogue, and can have no owner while in stock. Changing owner with an effective date closes the preceding ownership and updates the current owner in one transaction. Historical job bill-to customers are not changed by an ownership change. Vehicle detail includes ownership and service history.
5. Open a job from an appointment or by searching registration/VIN. The owner is the initial bill-to customer; another customer may be selected. Required fields are customer, vehicle, service type, mileage, bay, service advisor, mechanic or team, promised delivery time, and at least one complaint. Job numbers are generated on the server as `YYYY######`. The appointment must match the branch/vehicle and cannot be opened twice.
6. Add observations, work done, estimates, labour and parts. Estimates store complaint/part/labour price snapshots and a customer approval or decline. Model rates can be fixed or time-based; only admins may override a job labour rate. Part issues, returns, stock quantities and stock transactions are updated atomically.
7. Use the job actions: `OPEN → IN_PROGRESS → QC → READY → BILLED → DELIVERED`. Cancellation requires a reason and is prohibited after billing. Every transition records actor/time/remarks. Billing is performed by the existing job-bill service, not by a status dropdown. Bill cancellation restores `READY` with an audit entry; delivered bills cannot be cancelled.
8. Delivery requires a bill or explicit admin credit approval. It records a delivery advisor, server timestamp and generated gate pass. Delivery after the promise requires one to six distinct active late-reason codes. The Print action includes the job card and issued gate pass.

## Defaults and permissions

- `JOB_REPEAT_WINDOW_DAYS=30` by default; supported range 1–3650. Recent jobs are shown for the selected vehicle. Repeats require a previous job within that window and a reason.
- Workshop transactions remain branch-scoped. Shared customer/vehicle lookup does not grant cross-branch billing or inventory access.
- Master writes, customer merges, supplied customer codes, rate overrides and credit approvals require Admin/SuperAdmin. Existing job, labour, inventory and estimate permissions protect their respective actions.
- A company-charged service excludes its parts/labour from the customer bill. Manufacturer claim accounting and per-line warranty/goodwill charges belong to #64.
- `tallyPartyCode` preserves a legacy party code. Selecting an imported Tally ledger synchronizes this code. Posting continues to require the existing validated Tally ledger mapping.

## API additions

All paths below are relative to `/api`; staff authentication is required except for the customer-authenticated portal route. Request validation rejects unsupported job-opening/update fields.

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /workshop-masters`, `PUT /workshop-masters/:id` | Search, create, edit and deactivate master data |
| `GET /customers/duplicates` | Advisory duplicate matches |
| `POST /customers/:id/merge` | Merge into body `{ targetId }` |
| `POST /vehicles/:id/ownerships` | Owner change with `{ customerId, purchaseDate }` |
| `GET /service/staff` | Active branch advisors/technicians |
| `GET /service/vehicles/:id/recent-jobs` | Recent jobs for repeat assessment |
| `GET/POST /service/labour-rates` | Model rates; POST upserts by operation/model |
| `POST /service/job-cards` | Validated opening with generated number |
| `PUT /service/job-cards/:id` | Findings or lifecycle action |
| `POST /service/job-cards/:id/credit-approval` | Admin approval with remarks |
| `POST /service/job-cards/:id/estimates` | Priced complaint/part/labour lines |
| `POST /service/estimates/:id/approvals` | Bill-to customer approval/decline |
| `GET /portal/catalogue` | Vehicle catalogue for portal registration |

The existing `/inventory/issuances`, `/inventory/returns`, job labour and job-bill endpoints remain in use. Swagger route annotations include updated opening/action payloads and examples for the additional endpoints.

## Migration and verification

`20260929120000_workshop_foundation` is additive and idempotent. New opening fields remain nullable on legacy rows so migration does not fabricate mileage, staff assignments, complaints or dates. New job openings enforce these fields through Zod and the service. Existing numbers and readable legacy statuses are retained; the job sequence starts after existing ten-digit legacy numbers. Old free-text vehicle catalogue values remain readable until staff map those vehicles to catalogue entries on edit.

Apply the migration to a disposable database or isolated branch first, then generate Prisma and seed the sample masters using the existing full seed entry point. The seed adds a sample vehicle model, variant, colour, services, bays, complaints, team, late reasons and labour/model rate. It does not rewrite existing masters.

```sh
cd server
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed
npm run typecheck
npm run build
npm test -- --runInBand

cd ../client
npm run lint
npm run build
```

Database integration tests use **only** an explicitly provided `TEST_DATABASE_URL` pointing to a migrated disposable database. They exercise appointment opening, labour, issue/return, billing, late delivery/gate pass, ownership and merge in a transaction that rolls back its fixtures. They skip without that variable. Unit tests cover opening validation, numbering, odometer rollback, transitions, late/repeat rules, customer identity/code generation and duplicate warnings.

## Dependency on #64

This checkout does not contain #64's warranty/campaign module. Model warranty terms, vehicle sale date and odometer are stored here, but **calculated coverage, campaign eligibility, acknowledgment, the opening snapshot and warranty-case notifications are not implemented by this change**. Existing warranty text is displayed as legacy data; it is not a calculated eligibility result. Connect #64's preflight to the vehicle picker and `JobCardWorkflowService.open` once that module is available. Issue #67's warranty/campaign acceptance condition remains outstanding until then.

## Job-opening form

The opening modal is available from Job Cards, Dashboard and an appointment. Customer selection loads the full saved customer profile; the default vehicle search is filtered by that customer. Choose "All vehicles" for an explicitly different bill-to customer. Changing a customer, vehicle or branch clears incompatible booking/staff selections. Vehicle selection loads specifications and the last odometer reading; staff must confirm the current reading.

The form supports multiple complaint codes/requests, service/bay/team/staff selection, repeat assessment, a checklist, remarks and an indicative parts/oil/labour/service-charge breakdown. The server computes the total from the supplied breakdown in minor units. This opening estimate is separate from the priced estimate approval and invoice workflow. Ready status, delivery timestamps/advisor, invoice and gate pass remain lifecycle-controlled.

Migration `20260929160000_job_opening_details` adds customer residence phone, dialling code, fax, VIP, anniversary date and follow-up day/time, plus the job checklist and estimate breakdown. These customer preferences can be edited in the customer profile and are shown read-only when opening a job. Existing records without values display "Not recorded".

## Tabbed opening modal

The opening UI uses three tabs (Vehicle Details, Customer Requests, Other Details) and the existing semantic theme. Search comboboxes continue to use live APIs. The modal has keyboard tab navigation, error indicators, an unsaved-change guard, undo/reset confirmation and a Find lookup. Invoice, print and deletion actions remain unavailable until a job is saved; existing job details provide the corresponding lifecycle actions.

Customer and vehicle identity fields remain sourced from their existing records, with links to maintain those records. The app's active branch supplies the branch context. The guide's suggested relaxation of mileage and request requirements is not applied: odometer rollback is still rejected and at least one customer request is required. Historical visits are shown as a repeat-visit indicator, distinct from the existing repeat-repair workflow. Delivery cannot be marked complete during opening.

Migration `20260929180000_job_opening_requests` stores request defect codes and spare/oil/labour amounts, five tyre snapshots, battery details, A/C type and `customField1`. Tyre and battery makes use new `TYRE_MAKE` and `BATTERY_MAKE` master kinds managed in Settings. Request totals are recalculated on the server, overriding client-supplied breakdown totals. Loading an existing NGN estimate copies its priced lines into editable opening requests; it does not transfer invoice or approval status.

The legacy extra name lines map to contact person and registered name. The custom-field label is configurable in `opening/opening-ui.tsx`. Bay occupancy and colour swatches are not fabricated where the backend does not provide them. The customer checklist displays an empty placeholder until a source is configured.
