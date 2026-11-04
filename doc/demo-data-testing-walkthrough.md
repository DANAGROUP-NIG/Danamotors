# Demo data: manual testing walkthrough

This guide checks the demo data seed ([demo-data.md](./demo-data.md)) against each acceptance criterion of the "Load a small set of dummy data into the Dana Motors Demo account" issue. Work through the parts in order. Each step says what to do and what you should see.

**Logins.** Use the Demo account's test users for each role. On a local database seeded with `npm run prisma:seed`, these accounts exist:

| Role | Login | Branch scope |
|---|---|---|
| Service adviser (Main only) | `advisor1@kiamotors.com` / `Advisor@123` | Main Branch only |
| Service adviser (second branch) | the Demo account's adviser at Dana Motors Demo (locally: `advisor2@kiamotors.com` / `Advisor@123`, Abuja Branch) | second branch only |
| Workshop manager | `wm.lagos@kiaamotors.com` / `WManager@123` | Main Branch |
| Warranty officer | `warranty@kiamotors.com` / `Warranty@123` | All branches |
| General store manager | `store.lagos@kiamotors.com` / `Store@123` | All branches |
| Super admin | `superadmin@danamotors.com` / `SuperAdmin@123` | All branches |

**Job numbers.** These are assigned by the app's sequence, so they differ per database. Every seeded job card shows its key under **Additional information** (for example `DEMO-SEED/JC-04`), and the seed prints a key → job number table at the end of its run. Searching job cards by registration also works: `KJA-101DM`, `ABJ-202DM`, `LSR-303DM`, `TEST-WTY-01`, `TEST-WTY-02`.

---

## Part A: Load, re-run and safety (operator, terminal)

### A1. One command loads the data

1. On a disposable copy, or on the Demo database, run from `server/`:
   `npm run prisma:seed:demo`
2. **Expect:**
   - The run ends with `DEMO-SEED: done.`
   - The summary lists:
     - 5 demo job cards (JC-01…JC-05) and 2 TEST job cards
     - bills with VAT and round-off
     - 5 warranty cases: SUBMITTED, OPEN, REJECTED, OPEN, OPEN
     - 3 campaigns
     - the stock table
     - the vehicles with warranty results: ACTIVE + RC-DM-2601, ACTIVE, EXPIRED_DATE

### A2. Re-running creates no duplicates

1. Note the number of job cards, invoices and warranty cases (UI list totals, or the summary).
2. Run `npm run prisma:seed:demo` again.
3. **Expect:**
   - It finishes without errors.
   - The summary shows the same job numbers, bill numbers and case numbers.
   - No list in the UI has grown.
   - The next new job card you open by hand takes the next free number, so no numbers were used up by the re-run.

### A3. It refuses the wrong database

1. Run against a database whose name does not contain `demo`, without any flag:
   `DATABASE_URL=postgresql://…/danagroup_danamotors_dev npm run prisma:seed:demo`
   - **Expect:** refused with "is not a demo database … re-run with --allow-database=danagroup_danamotors_dev". Nothing is written.
2. Repeat with `NODE_ENV=production` and the flag.
   - **Expect:** refused ("NODE_ENV=production").
3. Use any database name containing `prod`.
   - **Expect:** always refused.
4. Run `npm run prisma:seed:demo -- --second-branch="Kia Plaza"`.
   - **Expect:** refused ("production store (CPD, Kia Plaza or VI)").

### A4. It does not create or change users

1. Users screen: note the number of users and the last-updated time of a few test accounts.
2. Run the seed.
3. **Expect:** the same user count, and the accounts are unchanged.

---

## Part B: Service adviser: job card and estimate

Log in as the **Main Branch service adviser**.

### B1. Open, update and print a job card

1. Go to **Job cards** and search `LSR-303DM`. Open **JC-04** (status Ready, marked repeat).
2. **Expect** the card to show:
   - service type: Running repair
   - mileage: 41,050
   - two complaints (check-engine light, hesitation)
   - service adviser and Main Branch
   - an opening date within the last week
   - **Repeat job** linked to JC-01
   - issued part: ignition coil
   - labour lines: diagnosis, coil replacement
3. Open **JC-05** (`KJA-101DM`, Open).
   - Update the observations or description and save. **Expect:** it saves.
4. Print JC-05 from the job card page. **Expect:** the printout shows the customer (Lakeside Courier Services Ltd), the vehicle, the complaints and the dates.

### B2. Create, revise and print an estimate

1. On **JC-05**, open the estimate section. **Expect:**
   - **Revision 1 – Declined / Revision Required** (sent back, with the customer's note)
   - **Revision 2 – Pending**: spark plugs ×4, engine oil, two labour operations, a free-text note line for the fuel system flush, and the service charge
2. Check the lines. **Expect:**
   - part lines show the part **name only**: no "O"/"L" or "genuine"/"local" wording anywhere the customer sees
   - the estimate total equals the sum of its lines (₦85,800)
3. Revise the estimate: add or remove a line and submit it as a new revision. **Expect:** revision 3 appears as Pending, and revision 2 becomes a previous revision.
4. Print the estimate. **Expect:** the lines and total match the screen, and there is still no part source.

---

## Part C: Workshop manager: assign, progress, approve or send back

Log in as the **workshop manager** (Main Branch).

1. Open **JC-05**. **Expect:** **no technician** (only Workshop team A). This is the "open and unassigned" card.
2. Assign a technician (Main Branch technician) and save. **Expect:** saved.
3. Record the customer decision on the latest estimate revision:
   - **Approve** it. **Expect:** status Approved, and the job can now move to In progress.
   - *(Alternative path: on another fresh revision, **send back** (decline) instead. Expect "Revision Required".)*
4. Update progress: move JC-05 to **In progress**. **Expect:** allowed only after approval. Before approval it is refused with "The latest estimate needs customer approval".
5. Open **JC-03** (switch to a Dana Motors Demo user, or use an all-branch manager). **Expect:**
   - status **In progress**, with a main mechanic assigned
   - parts issued: coil, plugs ×4, oil
   - the approved estimate with the customer's approval note

---

## Part D: Billing: ready job and the two seeded bills

Log in as the billing officer (or a user with job bill rights).

### D1. The ready job card can be billed

1. Go to **Invoices → New**. **Expect:** JC-04 (`LSR-303DM`) is in the billable job card list.
2. Preview the bill. **Expect:**

   | Line | Amount |
   |---|---|
   | Ignition coil assembly 1 × 52,000 | 52,000 |
   | Engine diagnosis 0.5 h × 12,500 | 6,250 |
   | Replace ignition coil and spark plugs 0.8 h × 12,500 | 10,000 |
   | Running repair service charge | 2,100 |
   | VAT 7.5% on labour + service (18,350) | 1,376.25 |
   | Round-off | −6.25 |
   | **Total** | **₦71,720** |

3. Create the bill. **Expect:** a new bill number, and JC-04 moves to **Billed**.

### D2. The unpaid bill (JC-02)

Open the bill for **JC-02** (Lakeside Courier, `KJA-101DM`). **Expect:**

| Line | Amount |
|---|---|
| Engine oil 1 × 27,500 (part) | 27,500 |
| Periodic maintenance 1.5 h × 9,500 (labour) | 14,250 |
| Paid service charge | 15,100 |
| VAT 7.5% of 29,350 | 2,201.25 |
| Round-off | −1.25 |
| **Total** | **₦59,050** |

- Status **Unpaid**, outstanding ₦59,050, with a due date about 30 days after the bill date.
- The ignition coil, plugs and coil-replacement labour are **not** on the bill. They are charged to warranty.
- The job card shows **Delivered** on approved credit.

### D3. The paid bill (JC-01)

Open the bill for **JC-01** (Tobi Adeyemi, `LSR-303DM`). **Expect:**
- parts ₦58,700 (plugs ×4, oil)
- labour ₦19,000
- service ₦15,100
- VAT ₦2,557.50
- round-off −7.50
- total **₦95,350**
- status **Paid**, outstanding 0, with a receipt allocated to it
- the job card is Delivered, with a gate pass

---

## Part E: Parts: stock queries and consistency

Log in as the **general store manager** (all branches).

1. Go to **Inventory → Part query** and check each part:

   | Part | Main Branch | Dana Motors Demo | Shows |
   |---|---|---|---|
   | `18846-DM010` | 32 available, minimum 12 | 20 | healthy stock |
   | `LOC-EO5W30-4L` | 4 available, minimum 10 | 8 | low stock, below the minimum |
   | `27301-DM020` | 0 | 4 | zero stock at Main, other-branch-only |

2. Open the stock transactions for each part at Main Branch. **Expect:**
   - one `RECEIVED` opening movement, and one `ISSUED` movement per issue on the seeded job cards
   - Main Branch: plugs 40 − 4 (JC-01) − 4 (JC-02) = 32; oil 6 − 1 − 1 = 4; coil 2 − 1 (JC-02) − 1 (JC-04) = 0
   - Dana Motors Demo: each part is reduced by the JC-03 issue
3. As a store user, try to issue `27301-DM020` at Main Branch to JC-05. **Expect:** refused for insufficient stock.

---

## Part F: Warranty officer: coverage, claims, campaigns

Log in as the **warranty officer**.

### F1. Coverage checks (the three results)

Start opening a new job card, or check in an appointment, for each vehicle and look at the warranty panel:
- `ABJ-202DM` (Rio). **Expect:** **Active**.
- `LSR-303DM` (Sorento). **Expect:** **Expired** (warranty period ended).
- `KJA-101DM` (Sportage). **Expect:** **Active**, plus the open campaign **RC-DM-2601**. The job card cannot be created until the campaign is acknowledged, and once it is created the job card shows the campaign.

### F2. Seeded cases (view)

Go to **Warranty**. **Expect** these cases:

| Case | Job card | Status | What it shows |
|---|---|---|---|
| Case on JC-03 (Rio, Dana Motors Demo) | JC-03 | **OPEN** | complaint C104; lines: coil (causal, D07/P03), plugs ×4 (consequential, D11/P03), labour 0.8 h, all linked to the job card lines |
| Case on JC-02 (Sportage) | JC-02 | **SUBMITTED** | manufacturer claim no. `DMCLM-26-0101`, claim and submission dates; the same line pattern at position P02 |
| Case on JC-05 (Sportage) | JC-05 | **REJECTED** | claim `DMCLM-26-0102`; reject reason **R01 Not a manufacturing defect**; remarks about fuel contamination; lines with defect D15 |

### F3. TEST- cases: create, submit, approve, reject

1. Open the case for `TEST-WTY-01`. **Expect:** OPEN, no lines, no complaint code.
2. Work the full claim:
   - add a causal part line (`27301-DM020`, defect D07), a consequential part line (`18846-DM010`) and a labour line
   - set the complaint code
   - **Start review**, then **Submit** with a manufacturer claim number
   - **Approve** it. **Expect:** status Approved, with approved amounts on the lines.
3. Do the same on `TEST-WTY-02`, but **Reject** it with reason R01. **Expect:** Rejected.
4. Confirm the seeded non-test cases (F2) are unchanged.

### F4. Reset the TEST- cases (operator)

1. Run `npm run prisma:seed:demo -- --reset-test`. **Expect:** the terminal shows `APPROVED -> OPEN` and `REJECTED -> OPEN` for the two TEST cases.
2. Reopen both cases. **Expect:**
   - OPEN, with no lines, no claim number and no decision
   - the history ends with "Reset to OPEN by the demo seed"
3. Check the seeded cases. **Expect:** OPEN / SUBMITTED / REJECTED, untouched.

### F5. Campaigns and covered vehicles

Go to **Campaigns**. **Expect:**

| Campaign | Status | Check |
|---|---|---|
| **RC-DM-2601** Recall | Active | covers the Sportage model years; part `91200-DMxxx` and labour `RC2601-01`; start and end dates; vehicles: `KNAPX81DMR7000101` **Pending** (Lakeside's Sportage), `…0111` **Contacted** (with a contact log), `…0112` **Pending**, shown as **not in the system** |
| **FF-DM-2602** Free fix | Active | `KNAPM81DMK7000301` **Completed**, linked to job card JC-01 (click through to the job card); `…0311` **Scheduled**; `…0312` Pending |
| **SC-DM-2603** Service campaign | Draft | three pending VINs; can be edited or activated |

---

## Part G: Branch visibility

1. Log in as the **Main Branch service adviser** (main-branch-only). **Expect:**
   - Job cards: JC-01, JC-02, JC-04, JC-05 and TEST-01. **No** JC-03 or TEST-02.
   - Opening JC-03 by URL is refused.
   - Customers: Zainab Garba (Dana Motors Demo) is not listed.
2. Log in as the **Dana Motors Demo service adviser**. **Expect:** JC-03 and TEST-02 only.
3. Log in as the **super admin**, or another all-branch user. **Expect:** all seven job cards, both branches' stock, and all five warranty cases.

---

## Part H: No real data, no production stores

1. Browse the seeded customers and vehicles. **Expect:**
   - phone numbers `+234809990010x` / `…019x`
   - e-mail addresses ending in `demo.danamotors.test`
   - registrations ending in `DM`, or starting `TEST-`
   - VINs containing `DM`
2. Branch lists. **Expect:** only the Demo branches. No CPD, Kia Plaza or VI branch is created.

---

## Sign-off checklist

- [ ] A1–A2: one command; a re-run creates no duplicates and fails nothing
- [ ] Records for job card, estimate, bill, part, warranty, test warranty and campaign (summary and Parts B–F)
- [ ] B: open, update and print a job card; create, revise and print an estimate without creating records first
- [ ] C: assign a technician, update progress, approve or send back an estimate
- [ ] F: check coverage; create, submit and decide claims on TEST- cases; view campaigns and covered vehicles
- [ ] D: the ready job card bills; the unpaid and paid bills show correct VAT and round-off; totals agree with the lines
- [ ] E: healthy, low, zero and other-branch-only stock; stock agrees with the issues
- [ ] G: two branches; an all-branch user sees both, a main-branch-only user sees one
- [ ] H and A3: no real personal data; no CPD or Kia Plaza; refuses production
- [ ] A4: no user accounts created or changed
- [ ] F4 and [demo-data.md](./demo-data.md): run, re-run and reset documented and working
