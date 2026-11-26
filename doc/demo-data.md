# Demo data seed

A small, repeatable set of **dummy** records for the Dana Motors Demo account, so testers can open, revise, bill and claim against real-looking data without creating it first. It covers job cards, job estimates, job bills, part issues, warranty cases, TEST warranty cases and campaigns.

Everything is invented. That includes customers, phone numbers (`+234 809 990 01xx`), e-mail addresses (`@demo.danamotors.test`), registrations and VINs. Nothing is copied from the legacy `autoenhancer` or `CPDAutoEnhancer` databases. They were used only to decide what the records should look like.

Code: `server/prisma/seed/demo/`. Step-by-step manual test guide: [demo-data-testing-walkthrough.md](./demo-data-testing-walkthrough.md).

## Run

From `server/`, with `DATABASE_URL` pointing at the Demo database:

```bash
cd server
npm run prisma:seed:demo
```

Before running:

- Apply the migrations (`npm run prisma:deploy`).
- The Demo account needs these existing users. The seed acts as them and **never creates or changes users**:
  - an active **service adviser** and **technician** at each of the two branches
  - a **warranty officer**
  - an **admin** (or super admin)

  Store and billing users are used when present; otherwise the service adviser stands in. A **workshop manager** at each branch passes quality checks to the advisor when present; otherwise the admin does.
- The two branches must exist and be active. The defaults are `Main Branch` and `Dana Motors Demo` (the Demo account's two branches). Pass other names with `-- --main-branch="…" --second-branch="…"`; for example, a local database built with `npm run prisma:seed` has `Abuja Branch` instead, so add `-- --second-branch="Abuja Branch"` there.

Only the repeat job demo: `npm run prisma:seed:demo -- --repeat-only` (needs the repeat job migration). It sets
the repeat window to 15 days / 500 km at the main branch and 45 days / 4,000 km at the second branch, adds customer
`DEMO-C31` with vehicles `LSR-701RP`…`LSR-708RP`, earlier visits as finished history, and opens repeat visits
today through the app (RPT-1…RPT-5: automatic pending, automatic by km, confirmed, not a repeat, manual).
RPT-6…RPT-8 have no new job, for testing the opening form. See `doc/repeat-jobs-testing-guide.md`.

Only the CSC demo: `npm run prisma:seed:demo -- --csc-only` (needs the CSC migration). It adds customer
`DEMO-C41` with vehicles `LSC-101CS`…`LSC-114CS` (ABC-112CS at the second branch), earlier visits as finished
history, generates the cases due from 45 days ago to 30 days ahead through the app, and records follow-ups
through the app: a booking (CSC-5), a call before the vehicle went overdue (CSC-6), final closures (CSC-9 R0004,
CSC-10 R0003) and a partial closure (CSC-11 R0001). CSC-8 is already visited; CSC-14 is left out. See
`doc/csc-testing-guide.md`.

Only the late delivery demo: `npm run prisma:seed:demo -- --late-only` (needs the late deliveries migration). It
adds customers `DEMO-C51` (main branch) and `DEMO-C52` (second branch) with vehicles `LSL-801LD`…`LSL-809LD` and
`ABJ-810LD`, and finished jobs `DM-LATE-1`…`DM-LATE-10` at fixed January 2026 dates: late by date (one just after
midnight), late by time, on time, exactly on time, not delivered, and one at the second branch. Some have reasons and
remarks, some none. See `doc/late-deliveries-testing-guide.md`.

Only the post-service follow-up demo: `npm run prisma:seed:demo -- --psf-only` (needs the PSF migration). It adds
customers `DEMO-C61`…`DEMO-C65` (C62 and C65 without a phone, C65 without an address; C64 at the second branch),
labour `DM-PSF-AC` (followed up), `DM-PSF-ENG` (major) and `DM-PSF-WASH` (not followed up), service type `AC`
(accidental) when missing, and jobs `DM-PSF-1`…`DM-PSF-11` delivered at fixed February 2026 dates with calls at fixed
times: not followed up, not available then satisfied, dissatisfied, dissatisfied then closed, no phone, accidental,
not delivered, and one at the second branch. A job that already has a follow-up is left as the tester changed it.
See `doc/psf-testing-guide.md`.

The run prints a summary at the end. It lists the job numbers, bills (with VAT and round-off), warranty case numbers, stock per branch, campaign VIN statuses and the warranty check result for each vehicle. Share it with the testers.

## Re-run

Run the same command again. It is **idempotent**:

- Customers are matched by code (`DEMO-C0x`, `TEST-C0x`), vehicles by VIN, parts by part number, labour by code, and campaigns by campaign code. Records that already exist are left unchanged.
- Job cards are matched by an immutable key in **Additional information** (`customField1`), such as `DEMO-SEED/JC-02`. It can only be set when a job card is opened.
- When a scenario (a job card or a campaign) finishes, the seed records it in the audit log (`DEMO_SEED_COMPLETED`). Later runs leave finished scenarios alone, even after testers have changed them.
- If a run stops part way (for example, a lost connection), the next run picks up from where it stopped. Each step checks the current state first.

**Running from a workstation against a remote database** is slow. Every query pays the network round trip (about 0.5 s to the shared server), so a full run can take 20–30 minutes; it prints each job card as it starts. The app's services limit a transaction to 15 s, which a bill exceeds over such a link. For the seed process only, the limit is raised to 120 s and slow-query logging is quieted (`prisma/seed/demo/remote-db.ts`); the API is not affected. Running the seed on the server next to the database is much faster.

A second run creates nothing. It uses no document numbers and fails nothing. This was verified by comparing row counts in every affected table, plus the `DocumentSequence` total, before and after.

## Reset the TEST- warranty cases

```bash
npm run prisma:seed:demo -- --reset-test
```

This puts every warranty case on a `TEST-` vehicle back to **OPEN**:

- Claim lines, complaint code, manufacturer claim number and dates, decision, reject reason and settlement are cleared.
- The reset is recorded in the case history ("Reset to OPEN by the demo seed") and in the audit log.
- Other cases, job cards, parts and stock are not touched.

Run it as often as needed. A case that is already OPEN and empty is skipped.

If the TEST- records were deleted, run `npm run prisma:seed:demo` to create them again.

## Safety rules

The seed checks the target before it touches anything:

| Target | Result |
|---|---|
| Database name contains `prod` or `live` | Always refused |
| Database name contains `demo` (for example `danagroup_danamotors_demo`) | Runs |
| Any other database (the shared dev database, a local database) | Refused unless you pass `--allow-database=<exact database name>` |
| Any non-demo database while `NODE_ENV=production` | Always refused, even with the flag |
| Branch named CPD / Central Parts, Kia Plaza or VI, or with store code `DH`, `A` or `VI` | Refused. These branches exist in production only |

The connection string is never printed. Only the database name and host are shown.

> The shared dev database (`danagroup_danamotors_dev`) is used by the whole team. Only seed it with `--allow-database=danagroup_danamotors_dev` after the team agrees.

## What gets loaded

Dates are relative to the day of the run. The job cards are dated across the last three weeks, so warranty periods and campaign dates do not go stale.

**Customers (5)**

| Code | Customer | Branch | Notes |
|---|---|---|---|
| DEMO-C01 | Tobi Adeyemi (individual) | Main | Owns the Sorento |
| DEMO-C02 | Zainab Garba (individual) | Dana Motors Demo | **₦50,000 credit balance** (opening credit note) |
| DEMO-C03 | Lakeside Courier Services Ltd (company) | Main | 30-day credit terms; owns the Sportage |
| TEST-C01 / TEST-C02 | TEST-Warranty Customer One / Two | Main / Dana Motors Demo | Test warranty only |

**Vehicles (5)**

| Registration | Vehicle | Warranty check |
|---|---|---|
| KJA-101DM | Kia Sportage, sold about 14 months ago | **Active**, plus the open recall **RC-DM-2601** |
| ABJ-202DM | Kia Rio, sold about 8 months ago | **Active** |
| LSR-303DM | Kia Sorento, sold about 6.5 years ago | **Expired** (by date) |
| TEST-WTY-01 / TEST-WTY-02 | Kia Sportage / Rio | Active (test only) |

**Parts (3)**

| Part number | Part | Source | Main Branch | Dana Motors Demo |
|---|---|---|---|---|
| 18846-DM010 | Spark plug, iridium | O (genuine) | 32, min 12: **healthy** | 20 |
| LOC-EO5W30-4L | Engine oil 5W-30, 4 L | L (local) | 4, min 10: **low** | 8 |
| 27301-DM020 | Ignition coil assembly | O (genuine) | **0** | 4: **other branch only** |

Opening stock enters as a `RECEIVED` stock movement. The seeded job cards then issue parts through the normal part issue, which is why main-branch stock ends where it does.

**Job cards (5 plus 2 TEST)**

| Key | Vehicle / branch | Status | Step | Estimate(s) | Bill | Warranty case |
|---|---|---|---|---|---|---|
| JC-01 | Sorento / Main | Delivered | Closed | Approved | **Paid** (₦95,350) | none (expired) |
| JC-02 | Sportage / Main | Delivered on credit | Closed | Approved | **Balance ₦49,050** (₦59,050 less the ₦10,000 advance) | **SUBMITTED** |
| JC-03 | Rio / Dana Motors Demo | **In progress**, technician, parts issued | Repair | **Approved** (customer approval) | none | **OPEN** |
| JC-04 | Sorento / Main | **Ready for delivery, unbilled**. Repeat of JC-01 | Billing | Approved | none: the tester bills it | none |
| JC-05 | Sportage / Main | **Open, unassigned** (team only). Repeat of JC-02 | Check-in | Rev 1 **sent back**, rev 2 **pending** | none | **REJECTED** |
| TEST-01 / TEST-02 | TEST vehicles / Main, Dana Motors Demo | Open | Check-in | none | none | OPEN, empty |

Jobs that start work go through the staged job card: check-in, diagnosis, the warranty check when the vehicle needs it, the estimate, then repair. The cashier records a **₦10,000 advance** (or the suggested amount if lower) before work starts, and the technician presses **Request parts** before the store issues parts (without a store officer at the branch the request time is recorded). Every job that leaves check-in has its walk-around recorded through the check-in service (half a tank, hub caps missing, AC not working, service book seen with 3 stamps, umbrella in boot, a scratch on the rear bumper and a dent on the front right door) and instructions to the technician. Jobs seeded today (the JC-S jobs) are also signed by the owner on screen, with a drawn demo signature. The historical scenario jobs are re-dated after seeding, which would change the opening date the customer signed, so they are recorded like jobs from before signed consent (`TODO(confirm)`).

**Staged job card: one job at every step (JC-S01 to JC-S18)**

Customer `DEMO-C05` Adaeze Okafor (fictional) and existing demo customers, all at the main branch, each on its own vehicle. Periodic service labour only, no parts.

| Key | Plate | Step | State |
|---|---|---|---|
| JC-S01 | KJA-482TX (Sportage, in warranty) | Check-in, Walk-around | Just opened: three customer requests, nothing on the walk-around yet. Last recorded reading 43,100 km |
| JC-S02 | LSR-512ST | Diagnosis | No technician yet (team only): waiting for the workshop supervisor to assign one |
| JC-S03 | LSR-513ST | Diagnosis, Findings | Technician assigned, nothing recorded yet |
| JC-S04 | KJA-514ST (Sportage, in warranty) | Warranty | Waiting for the warranty officer |
| JC-S05 | LSR-515ST | Estimate | Estimate waiting for the customer's approval |
| JC-S06 | LSR-516ST | Repair | Paused for parts |
| JC-S07 | LSR-517ST | Quality check | Waiting for the QC result |
| JC-S08 | LSR-518ST | Billing | QC passed, waiting for the advisor to mark it ready |
| JC-S09 | LSR-519ST | Delivery | Billed ₦31,550, balance ₦21,550 |
| JC-S10 | LSR-520ST | Cancelled | Cancelled at the estimate: "Customer took the vehicle elsewhere" |
| JC-S11 | KJA-521ST (Sportage, in warranty) | Check-in, Customer consent | Details and walk-around done, waiting for Tobi Adeyemi to sign. Last recorded 24,600 km |
| JC-S12 | LSR-522ST | Check-in, ready to send | Signed by the owner, Lakeside Courier Services Ltd; ready to send to the workshop supervisor |
| JC-S13 | LSR-524ST (Sorento, out of warranty) | Diagnosis, Engineer review | Findings sent to the service engineer: front pads worn (brake pads work and part), AC compressor clutch flagged **Possible warranty** (so it routes to the warranty officer), and a torn rear wiper blade the customer did not mention |
| JC-S14 | LSR-525ST (Sorento) | Diagnosis, Findings | Returned by the service engineer: "Check the wheel alignment readings and the front suspension bushes before we quote." |
| JC-S15 | LSR-526ST (Sorento, out of warranty) | Diagnosis, Engineer review | 100,000 km service findings, nothing warranty related: confirming sends it to the service advisor and skips the warranty step |
| JC-S16 | KJA-527ST (Sportage, sold about 600 days ago) | Warranty check | Service history with one missed service (year 2, quarter 2: a 165-day gap between the services 175 and 10 days before the seed run). Findings: AC compressor clutch (possible warranty) with AC check labour, AC compressor and refrigerant; front brake pads (labour and part); the 25,000 km service with engine oil. No decisions yet |
| JC-S17 | KJA-528ST (Sportage, sold about 250 days ago) | Warranty check | Regular history (services 170 and 85 days before the run), linked to the open recall RC-DM-2601: periodic service with oil, and harness rerouting labour for the recall. No decisions yet |
| JC-S18 | KJA-529ST (Sportage) | Warranty check | No sale date recorded (cleared before the job opened), so coverage cannot be confirmed and the service history cannot be checked; AC compressor finding flagged possible warranty |

Jobs past diagnosis (JC-S04 onward and the scenario jobs) are diagnosed through the services: the workshop supervisor assigns the technician and a bay (bays A1 to A4 are added when missing), the technician records a finding per request with the periodic service labour, and the service engineer confirms. The service engineer is an active Engineer at the branch, or the admin where the branch has none (`TODO(confirm)`); the seed never creates users.

The earlier services of KJA-527ST and KJA-528ST are delivered paid-service (RG) jobs written directly (`DM-WTY-<plate>-<n>`, `prisma/seed/demo/warranty-check.ts`); RG is marked Periodic maintenance. KJA-528ST is added to the recall before its job opens. Jobs that pass through the warranty check on their way to the estimate get every item decided as customer pay by the warranty officer first.

A booking for **KJA-523ST** (Sportage, Adaeze Okafor, last recorded 16,050 km, two requests) is left open at the main branch so testers can open a job card from it.

Every estimate has parts (genuine and local) and labour: coded operations, plus general labour with a free-text description. The bills are created by the billing service. They take VAT on labour and service charge and the round-off from the branch settings (defaults: 7.5% VAT, rounded down to the nearest ₦10). The totals quoted in these docs assume the defaults; a branch with other settings shows different totals. JC-01's bill is paid by a cash receipt, and JC-02 was delivered on approved credit.

**Campaigns (3)**

| Code | Type / status | Covered | VINs |
|---|---|---|---|
| RC-DM-2601 | Recall, ACTIVE | Sportage; harness inspection labour and part | Sportage **pending**; one **contacted**; one pending with **no vehicle record** |
| FF-DM-2602 | Free fix, ACTIVE | Sorento; ECU update labour and part | Sorento **completed by job card JC-01**; one **scheduled**; one pending |
| SC-DM-2603 | Service campaign, DRAFT | Rio; air-conditioning check labour and part | Three pending (no vehicle records) |

**Service MIS history (#97)** (`prisma/seed/demo/mis.ts`)

Finished job history for the MIS reports, at fixed days before the run. These job cards are written directly as
closed records (labour, requisitions with their stock movements, a return slip, complaints and bills), because
estimates and signatures do not matter to the reports; the live workflows are the jobs above.

| Job | Vehicle / branch | Service | Opened | Points to check |
|---|---|---|---|---|
| DM-MIS-01 | LSR-501MS Rio / Main | 1F free service | 35 days ago | free service done within 30 days of sale; oil; no customer bill |
| DM-MIS-02 | LSR-503MS Sportage / Main | RG paid service | 30 days ago | 10% labour discount; delivered **late** |
| DM-MIS-03 | LSR-502MS Rio / Main | RR running repair | 20 days ago | body-repair labour; 2 brake pads, **1 returned**; coded **major** complaint and a free-text one |
| DM-MIS-04 | LSR-501MS Rio / Main | AC accidental | 12 days ago | 3 panels body work; bumper; mud flaps (accessory) |
| DM-MIS-05 | LSR-502MS Rio / Main | RR running repair | 8 days ago | **repeat** of DM-MIS-03; **warranty** requisition; non-major complaint code |
| DM-MIS-06 | KNAPM81DMT7000504 Sorento (stock) / Main | PD PDI | 5 days ago | PDI job on an unsold vehicle |
| DM-MIS-07 | ABJ-505MS Sportage / second branch | RG paid service | 15 days ago | second branch column of the MIR |
| DM-MIS-08 | LSR-503MS Sportage / Main | RG paid service | 2 days ago | **still open**: in productivity and problems, not in delivered reports |

Engineers: the first two active users with the **Engineer** role at each branch (the base staff seed adds
`engineer1`–`engineer3`; they cannot log in). Without one, the technician is named as engineer.

Also loaded: customers DEMO-C21 (Ngozi Eze, birthday and anniversary this month), DEMO-C22 (Tunde Bakare, birthday
24 Dec, anniversary 5 Jan), DEMO-C23 (Halima Sule, bought LSR-503MS **10 days ago**: the resale) and DEMO-C24 (second
branch); LSR-501MS sold 60 days ago (1F done) and LSR-502MS sold 75 days ago (**1F skipped**); service groups on the demo
labour items, labour `DM-BODY-PNT` (body repair), complaint codes `DM-EN01` (major) and `DM-BR02`, and five parts
(`26300-DM035`, `LOC-EO5W30-MIS` oil, `58101-DM100`, `86511-DM200`, `ACC-MUDFLAP-DM` accessory) with opening stock.

## Design notes

- **The app's own services do the work.** Job opening runs the warranty check and campaign acknowledgement. Estimates and decisions, labour, part issues, quality check, billing, receipts, credit approval, delivery, claim lines and decisions, and campaigns all go through the services the API uses. Document numbers come from the sequence table, and the bill totals come from the billing calculator.
- **Credit approval** used to live inside the API route. It is now `JobCardWorkflowService.approveCredit`, so the route and the seed share it. Its behaviour is unchanged.
- **Back-dating.** Services stamp records with the current time. After a job card's scenario finishes, the seed moves the job's whole timeline (history, estimates, labour, issues and their stock movements, bill, receipt, warranty case, campaign completion) onto its window in the past. The order of events is kept, and amounts and links are not changed. Campaign activation dates are set to the campaign start date.
- **Part source** (`partFlag`) is stored on the part only. Estimates and bills show the part name.

## Known gaps

- **Free-text labour.** The labour catalogue has no free-text lines; every job card labour line needs a catalogue operation. Free-text work is quoted on the general operation `DM-GEN-LAB` and described in a free-text (complaint) line of the estimate.
- **Seeded labour lines are always customer-paid** unless reclassified. JC-02 and JC-03 move the ignition repair labour to warranty, which is how an adviser or warranty officer would do it.
- The seed does not create branches, users or the base reference seed. Run `npm run prisma:seed` on an empty local database first.
