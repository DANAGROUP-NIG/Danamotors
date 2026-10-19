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

  Store and billing users are used when present; otherwise the service adviser stands in.
- The two branches must exist and be active. The defaults are `Main Branch` and `Dana Motors Demo` (the Demo account's two branches). Pass other names with `-- --main-branch="…" --second-branch="…"`; for example, a local database built with `npm run prisma:seed` has `Abuja Branch` instead, so add `-- --second-branch="Abuja Branch"` there.

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

| Key | Vehicle / branch | Status | Estimate(s) | Bill | Warranty case |
|---|---|---|---|---|---|
| JC-01 | Sorento / Main | Delivered | Approved | **Paid** (₦95,358) | none (expired) |
| JC-02 | Sportage / Main | Delivered on credit | Approved | **Unpaid** (₦59,051) | **SUBMITTED** |
| JC-03 | Rio / Dana Motors Demo | **In progress**, technician, parts issued | **Approved** (customer approval) | none | **OPEN** |
| JC-04 | Sorento / Main | **Ready for delivery, unbilled**. Repeat of JC-01 | Approved | none: the tester bills it | none |
| JC-05 | Sportage / Main | **Open, unassigned** (team only). Repeat of JC-02 | Rev 1 **sent back**, rev 2 **pending** | none | **REJECTED** |
| TEST-01 / TEST-02 | TEST vehicles / Main, Dana Motors Demo | Open | none | none | OPEN, empty |

Every estimate has parts (genuine and local) and labour: coded operations, plus general labour with a free-text description. The bills are created by the billing service. They show VAT on labour and service charge at 7.5% and round-off to the naira. JC-01's bill is paid by a cash receipt, and JC-02 was delivered on approved credit.

**Campaigns (3)**

| Code | Type / status | Covered | VINs |
|---|---|---|---|
| RC-DM-2601 | Recall, ACTIVE | Sportage; harness inspection labour and part | Sportage **pending**; one **contacted**; one pending with **no vehicle record** |
| FF-DM-2602 | Free fix, ACTIVE | Sorento; ECU update labour and part | Sorento **completed by job card JC-01**; one **scheduled**; one pending |
| SC-DM-2603 | Service campaign, DRAFT | Rio; air-conditioning check labour and part | Three pending (no vehicle records) |

## Design notes

- **The app's own services do the work.** Job opening runs the warranty check and campaign acknowledgement. Estimates and decisions, labour, part issues, quality check, billing, receipts, credit approval, delivery, claim lines and decisions, and campaigns all go through the services the API uses. Document numbers come from the sequence table, and the bill totals come from the billing calculator.
- **Credit approval** used to live inside the API route. It is now `JobCardWorkflowService.approveCredit`, so the route and the seed share it. Its behaviour is unchanged.
- **Back-dating.** Services stamp records with the current time. After a job card's scenario finishes, the seed moves the job's whole timeline (history, estimates, labour, issues and their stock movements, bill, receipt, warranty case, campaign completion) onto its window in the past. The order of events is kept, and amounts and links are not changed. Campaign activation dates are set to the campaign start date.
- **Part source** (`partFlag`) is stored on the part only. Estimates and bills show the part name.

## Known gaps

- **Free-text labour.** The labour catalogue has no free-text lines; every job card labour line needs a catalogue operation. Free-text work is quoted on the general operation `DM-GEN-LAB` and described in a free-text (complaint) line of the estimate.
- **Seeded labour lines are always customer-paid** unless reclassified. JC-02 and JC-03 move the ignition repair labour to warranty, which is how an adviser or warranty officer would do it.
- The seed does not create branches, users or the base reference seed. Run `npm run prisma:seed` on an empty local database first.
