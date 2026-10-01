# Warranty & Campaigns: Walkthrough and Manual Test Guide

This guide explains what was built for the warranty and campaigns issue, how the pieces fit together, and how to test
every part by hand. Part 1 explains the feature. Part 2 is the hands-on test script. Part 3 is notes for scrum.

For the technical reference (rules, API, permissions), see `doc/warranty.md`.

---

# Part 1: Understanding the implementation

## 1.1 The problem in one paragraph

Some customers' vehicles are still under Kia's manufacturer warranty. If one comes in for a repair, the workshop must
know **before** it opens the job card, because Kia should pay for that repair, not the customer. In the legacy system
nobody was told. Warranty was never checked automatically, and recalls (Kia telling us "these exact cars have a
defect, call them back") could not be targeted at specific cars or tracked.

## 1.2 What we built, in five parts

| # | Part | In one sentence |
|---|---|---|
| 1 | **Warranty coverage** | The system calculates whether a vehicle is under warranty from its model's policy, its sale date and its mileage. |
| 2 | **Check before the job card** | When a vehicle is checked in or a job card is opened, the adviser sees warranty and recall banners and must confirm they told the customer. |
| 3 | **Warranty cases** | A covered job automatically opens a "warranty case", which a new Warranty Officer role takes through Kia's claim process to settlement. |
| 4 | **Who pays for each line** | Every part and labour line on a job card is marked Customer, Warranty, Goodwill or Free, and the customer invoice only bills Customer lines. |
| 5 | **Campaigns** | Recalls and free fixes are created with the exact list of affected VINs, the team calls those customers, and progress is tracked to completion. |

How they connect:

```
 Vehicle model policy (e.g. Sportage = 5 years / 100,000 km)
        +  vehicle sale date  +  today's odometer
        │
        ▼
 ┌──────────────────────┐     open recalls / free fixes for this VIN
 │  WARRANTY CHECK      │◄──────────────────────────────────────────┐
 │  ACTIVE / EXPIRED /  │                                            │
 │  UNKNOWN …           │                                            │
 └─────────┬────────────┘                                            │
           │ shown at check-in and on the New Job Card page          │
           ▼                                                         │
 Adviser ticks "I informed the customer" ──► JOB CARD created        │
           │                                   │                     │
           │ if covered                        │ links campaigns     │
           ▼                                   ▼                     │
 WARRANTY CASE opened automatically      Campaign vehicle = SCHEDULED │
 + Warranty Officer notified                   │                     │
           │                                   │ job card completed  │
           ▼                                   ▼                     │
 Officer: review → submit to Kia →       Campaign vehicle = COMPLETED│
 decision → settled → closed                                         │
                                                                     │
 Parts & labour lines on the job card ─── Customer / Warranty /      │
 Goodwill / Free ─── invoice bills Customer lines only               │
                                                                     │
 CAMPAIGN (recall / free fix) ── affected VINs ── outreach ──────────┘
```

## 1.3 Key ideas, explained simply

### A. Coverage is calculated, never typed in

Before, vehicles had free-text fields like "Warranty status: active", which anyone could type and which were never
checked. Now coverage is **worked out every time** from three inputs:

1. **The model's policy**, set once per model in Warranty Settings. Example: Sportage, 1,825 days (5 years), 100,000 km.
2. **The vehicle's sale date**, which is when the warranty clock starts.
3. **The mileage**, which is today's odometer reading.

The rule is: covered while `today ≤ sale date + warranty days` **and** `mileage ≤ km limit`, whichever runs out first.

There are five results:

| Status | When |
|---|---|
| **Active** | Inside both limits |
| **Expired** | The time limit has passed |
| **Expired (km)** | Over the km limit |
| **Not covered** | The model is marked as not covered by warranty |
| **Unknown** | We don't know the sale date, the mileage or the model. **Unknown is never treated as covered.** |

Two special cases can be set on a single vehicle by a warranty officer, with a reason:

- **Extended warranty**: the customer bought extra years or km.
- **Goodwill**: the dealer agrees to cover it anyway, until a set date.

> Example: Sportage sold 12/03/2023, today 30/09/2026, odometer 61,580 km → **Active**, about 527 days or 38,420 km left.

### B. The odometer only goes forward

If the last recorded reading was 58,210 km, nobody can enter 50,000 km to make a car look "in warranty". A lower
reading is refused. The one exception is a real odometer replacement: the adviser ticks "Odometer was replaced" and
gives a reason, which is saved on the job card.

### C. The check happens before the job card, and the server enforces it

When the adviser picks a vehicle and enters the mileage, a panel shows:

- 🟢 **Vehicle is under warranty**, or 🟠 **expired / could not be confirmed**
- 🔴 **Open recall: RC-2026-014**, or 🔵 **Free fix: FF-2026-003**, for any open campaign on that VIN

If the car is covered or has an open campaign, **"Create Job Card" stays disabled** until the adviser ticks *"I have
informed the customer…"*.

Important for the demo: this isn't only a UI rule. The **server** re-checks everything when the job card is saved. If
someone skips the screen (Postman, an old app version), the server refuses with an error (`409 WARRANTY_ACK_REQUIRED`).
The appointment check-in dialog does the same check.

### D. The job card keeps a snapshot

When the job card is created it stores:

- the mileage
- the warranty status at that moment, and why
- the expiry date and km limit
- who acknowledged it

If someone later changes the model policy, **old job cards don't change**. That history is what Kia audits.

### E. Warranty cases (the officer's workbench)

If the vehicle was covered, a **warranty case** (for example `WTY2026000016`) is opened automatically, and the
branch's warranty officers get a notification with the customer, vehicle, VIN, mileage, job card and complaint.

The case moves through these steps, the same as the legacy "Pending / Approved / Denied / Returned" statuses:

```
Open → In review → Submitted (to Kia) → Approved / Partially approved / Rejected / Returned
Returned → In review again (Kia asked for corrections)
Approved / Partially approved → Settled (Kia paid) → Closed
Rejected → Closed        Open/In review → Closed = "withdrawn" (needs a reason)
```

Each step is validated:

- **Submit** needs the **causal part** (the part that failed), a defect code on each part, and the complaint.
- **Reject** needs a reason code.
- **Partial approval** needs a percentage per line.

Every step is written to a **status history** (who, when, remarks). Two officers clicking at the same time can't both
win; the second gets "changed by someone else".

The claim has three sections, like the legacy claim form:

- **Causal part**: the part that failed.
- **Consequential parts**: parts damaged because of it.
- **Labour.**

Only parts marked **"Warranty applicable"** in Part Master can be claimed.

### F. Who pays for each line (charge types)

Every line on a job card has a payer:

| Charge type | Legacy code | Meaning |
|---|---|---|
| **Customer** | N | The customer pays; this goes on the invoice |
| **Warranty** | W | Kia pays; this goes on the warranty claim |
| **Goodwill** | G | The dealer absorbs it; needs a warranty officer and a reason |
| **Free – campaign** | F | The recall or free-fix campaign pays |

The system picks a sensible default:

- **Free** if a linked campaign covers that part or operation.
- **Warranty** if the car was covered and the part is warranty-applicable.
- Otherwise **Customer**.

The adviser can change it, within rules.

**Generate invoice** now builds the customer invoice from the **Customer lines only**, plus 7.5% VAT. Warranty, goodwill
and free lines are never billed to the customer.

### G. Campaigns (recalls and free fixes)

A campaign has a code, title, type (Recall, Free fix or Service campaign), dates, models, and the parts and labour it
covers. **Affected vehicles are added by VIN**: paste them, upload Kia's Excel/CSV list, or pick by model, year and VIN
range.

- VINs that aren't in our system yet are still tracked, and link automatically when that car is registered.
- Each vehicle moves through **Pending → Contacted → Scheduled → Completed** (or *Not reachable* / *Not applicable*).
- Staff log calls and book appointments from the campaign page.
- When a job card is opened for the car, it becomes **Scheduled**. When that job card is **completed**, it becomes
  **Completed** automatically.
- The campaign page shows progress overall and **by branch**.

### H. New role and permissions

There is a new role, **WarrantyOfficer**. The new permissions are:

| Permission | What it allows |
|---|---|
| `warranty:read` | See warranty status and cases |
| `warranty:update` | Edit cases and lines, set the sale date, charge goodwill |
| `warranty:claim` | Move cases through the workflow |
| `warranty:settings` | Model policies, claim codes, extended warranty and goodwill |
| `campaign:read`, `campaign:create`, `campaign:update` | Campaigns |
| `campaign:vehicle:update` | Outreach: calls, scheduling, status |
| `jobcard:line:update` | Add labour lines and change who pays |

Who gets what by default:

- **Warranty officer** and **Admin**: everything above.
- **Service adviser**: read warranty and campaigns, and edit job card lines.
- **Receptionist** and **reception manager**: read, plus campaign outreach.

## 1.4 Where the code lives

**Backend (`server/`)**

| Path | What's in it |
|---|---|
| `prisma/schema.prisma` | New tables: `VehicleModel`, `WarrantyCase` (+ lines, history, four code tables), `JobCardLine`, `InvoiceLine`, `Campaign` (+ models, covered items, vehicles, contact logs), `JobCardCampaign`. New fields on `Vehicle`, `JobCard`, `SparePart`. |
| `prisma/migrations/20260930090000_warranty_and_campaigns` | The schema. Additive only; safe to re-run. |
| `prisma/migrations/20260930090100_warranty_permissions` | The new permissions and the WarrantyOfficer role. |
| `src/modules/warranty/` | `warranty.logic.ts` (coverage rules and case workflow, pure and unit-tested), `warranty.coverage.ts` (the check), `warrantyCase.service.ts` (cases), `warrantySettings.service.ts` (models and codes), routes and validation. |
| `src/modules/campaign/` | Campaign rules (`campaign.logic.ts`), service, routes, and hooks used by job cards. |
| `src/modules/job-card-line/` | Lines, charge types and invoice generation. |
| `src/modules/service/service.service.ts` | `createJobCard`: the check, the snapshot and the auto-opened case. Also check-in and the "job card completed → campaign completed" hook. |
| `prisma/seed/warranty.ts` | Demo data. |
| `prisma/legacy/warranty-migrate.ts` | Legacy data import. |

**Frontend (`client/`)**

| Path | What's in it |
|---|---|
| `features/warranty/` | Coverage card, check panel, check-in dialog, cases list and detail, decision dialog, settings |
| `features/campaigns/` | Campaigns list, form, detail, add-vehicles and outreach dialogs |
| `features/job-cards/` | New job card page, warranty snapshot cards, Parts & Labour card |
| `app/(dashboard)/` | New pages: `warranty/`, `warranty/[id]`, `warranty/settings`, `campaigns/…`, `job-cards/new` |

---

# Part 2: Manual testing, step by step

## 2.0 Before you start

**1. Get the latest code running**

```bash
cd server && npm install && npx prisma generate && npm run dev     # backend (port from server/.env)
cd client && npm install && npm run dev                             # frontend http://localhost:3000
```

Restart the backend after pulling. A backend started before the new files existed returns **404** for
`/api/warranty/...`.

**2. Database.** The shared dev database already has both new migrations. On a fresh local database, run
`npx prisma migrate deploy` first.

**3. Test data. Choose one:**

- **Option A, local database (recommended for a full demo).** `npm run prisma:seed:warranty` creates:
  - the Kia model policies
  - sample claim codes
  - a demo **Kia Sportage `KNAPU81BDP7123456`** (sold 12/03/2023, last reading 58,210 km) owned by the first customer
  - a **draft recall `RC-2026-014`** that includes it

  The full seed (`npm run prisma:seed`) also creates the user `warranty@danamotors.com` / `Warranty@123`.
- **Option B, shared dev database.** Don't run seeds there without asking the team, because they add demo rows. Instead,
  create the data through the UI in **T1** and **T2** below.

**4. Accounts**

| Role | Email | Password |
|---|---|---|
| Super admin | superadmin@danamotors.com | SuperAdmin@123 |
| Warranty officer | warranty@danamotors.com | Warranty@123 |
| Service adviser | advisor1@danamotors.com | Advisor@123 |
| Receptionist | reception1@danamotors.com | Recept@123 |
| Workshop manager | wm.lagos@danamotors.com | WManager@123 |

If the warranty officer doesn't exist on your database, create a user in **Users** with role **WarrantyOfficer**.

**5. Log out and back in after the migration.** Permissions live in the login token; an old token won't have the new
ones and you'll get **403**.

**6. Tools.** Use the browser, and for API checks Swagger at `http://localhost:<backend port>/api/docs`. Look for the
**Warranty**, **Campaigns**, **Job Card Lines** and **Vehicle Models** sections.

> Tip: keep a second browser profile or an incognito window logged in as the **warranty officer**, so you can watch
> notifications arrive while you work as the **adviser**.

---

## T1. Warranty settings (models and claim codes)

*Log in as the super admin or the warranty officer.*

1. Go to **Warranty** in the sidebar, then **Settings** (top right). Or use **Settings → Warranty**.
2. **Model policies tab:**
   - If empty (Option B), click **Add model** with Code `KIA-SPG`, Make `Kia`, Model `Sportage`, days `1825`,
     km `100000`, and Covered on. Save.
   - ✅ The row shows "5 years · 1,825 days", "100,000 km" and a green **Covered** badge.
   - Click the **pencil** on a model. ✅ A drawer opens with the warning *"Changing a policy re-calculates coverage for
     N vehicles. Existing job cards keep their snapshot."*
   - ❌ Try adding a second model with the **same code**. ✅ Error: "already exists".
3. **Complaint, defect, position and reject tabs:**
   - Add at least: one complaint code (`C104` Engine misfire), one defect code (`D07` Internal short), one position
     code (`P03` Cylinder 3) and one reject reason (`R02` Outside warranty period). You'll need them in T7.
   - Click **Deactivate** on one code. ✅ It turns grey and no longer appears in claim dropdowns.
4. **Part Master:**
   - Go to **Inventory**, open a part and edit it.
   - In the new **Warranty** section, tick **Warranty applicable** and enter a warranty rate (e.g. 48500). Save.
   - ✅ The part detail shows "Warranty: Applicable · ₦48,500.00".
   - Mark **another** part as *not* applicable; T6 uses both.

## T2. Vehicle warranty coverage card

*Super admin or warranty officer (setting the sale date needs `warranty:update`).*

1. Open **Vehicles** and click a vehicle. Option A: use the Sportage `KNAPU81BDP7123456`.
2. Option B: click **Edit**, choose **Model (warranty policy)** = Sportage and **Sale date** = 12/03/2023. Save.
3. ✅ The **Warranty Coverage** card shows:
   - a green **Active** badge
   - "Under manufacturer warranty — X or Y km remaining, whichever comes first"
   - **Time** and **Distance** meters
   - the policy text, the last recorded mileage and Source = Manufacturer
4. **Try each status.** Change the data and refresh:

   | Change | Expected |
   |---|---|
   | Sale date = 01/01/2019 | 🔴 **Expired**, "The warranty period has ended" |
   | Model = *Not linked* | 🟠 **Unknown**, "not linked to a model with a warranty policy" |
   | Model set but sale date cleared | 🟠 **Unknown**, "No warranty start (sale) date" |
   | In Settings, turn **Covered** off for that model | ⚪ **Not covered** |

   Put the values back afterwards (Sportage, 12/03/2023, Covered on).
5. **Override.** Click *Edit warranty details / extended warranty / goodwill*:
   - Choose **Goodwill**, set until = a date next month, reason "Goodwill approved by MD". Save.
     ✅ Source = Goodwill, Active, even with an old sale date.
   - Choose **None** to remove it.
6. **Permission check.** Log in as the **receptionist** and open the same vehicle. ✅ You can see the card, but the edit
   link is not shown.
7. ✅ The **Open Campaigns** card on the right says "No open recalls…" for now. It fills in after T3.

## T3. Create a recall campaign

*Warranty officer or super admin.*

1. Go to **Campaigns** in the sidebar, then **New campaign**.
2. Fill in the form:
   - Type: **Recall**
   - Code `RC-2026-014` (or any new code)
   - Title "Engine wiring harness inspection"
   - Start date = today or earlier, end date = end of year
3. **Models affected:** add Sportage, years 2021–2023.
4. **Coverage:** leave Labour and Parts covered on. Click **Add item**:
   - Labour, operation `HRN-01`, description "Harness inspection", max 1.2
   - Part `91200-D3xxx`, "Wiring harness". A trailing `x` means "any part number starting with 91200-D3".
5. Click **Save & add vehicles**. ✅ The campaign page opens and the **Add affected vehicles** dialog appears.
6. **Paste VINs** tab. Paste:
   ```
   KNAPU81BDP7123456
   KNAPU81BDP712
   KNAOU81BDP7123456
   KNAPU81BDP7000099
   ```
   ✅ Lines 2 and 3 turn red. The summary shows **valid**, **2 invalid** ("must be 17 characters" and "contains letter O";
   VINs never use I, O or Q), and **1 not in system — will be tracked by VIN**.
   Click **Add N vehicles**.
7. ✅ The campaign shows Status **Draft**, Affected = 2, "Unmatched VINs: 1 (not yet in our system)".
8. Optional: test the **Upload file** tab with an Excel file that has a column headed `VIN`, and the **By criteria**
   tab (model and years).
9. Click **Activate** (top right).
   - ✅ The status becomes **Active**.
   - ✅ Service advisers and the reception manager at the vehicle's branch get a bell notification: "Recall campaign
     activated…".
10. Go back to the vehicle from T2. ✅ **Open Campaigns** now shows the red **Recall RC-2026-014** with "Not yet contacted".
11. ❌ Try **Activate** on a new draft campaign with **no** vehicles. ✅ It is refused: "Add the affected vehicles before
    activating".

## T4. Appointment check-in with the warranty check

*Service adviser or receptionist.*

1. Create a **service appointment** for the Sportage's customer and vehicle (Appointments → New). Open it.
2. Click **Mark as Checked In**. ✅ A **Check in vehicle** dialog opens instead of changing the status immediately.
3. Type a mileage **lower** than the last recorded one. ✅ The field turns red: "cannot be lower". Confirm is disabled.
4. Type a valid mileage (e.g. last recorded + 300). ✅ After a moment:
   - 🟢 **Vehicle is under warranty**
   - 🔴 **Open recall: RC-2026-014 — …**, with a **View campaign** button
   - an amber box: "Customer informed about the warranty status and open recall", marked *Required*
5. ✅ **Confirm check-in** stays disabled until you tick the box. Tick it, then confirm.
6. ✅ The appointment is **Checked In**. The workshop manager and advisers get "Checked in — open campaign … RC-2026-014".
   The vehicle's **last recorded mileage** now equals what you typed (check the vehicle page).
7. Optional: try a mileage **over 100,000 km**. ✅ 🟠 "Warranty expired — mileage limit reached … unless goodwill is
   approved".
8. Note: in **Edit appointment**, the status dropdown no longer offers "Checked In". Check-in must go through the dialog.

## T5. New job card with the warranty check (the core of the feature)

*Service adviser `advisor1`. Keep the warranty officer logged in elsewhere.*

1. Go to **Job Cards → New job card**, or **Create Job Card** on the appointment, or **New Job Card** on the vehicle page.
2. Pick the Sportage. ✅ Chips show the customer, phone and branch. **Linked appointment** lists the checked-in
   appointment.
3. **Odometer:** ✅ "Last recorded: … km on …" shows. Enter a valid mileage.
4. ✅ The right-hand **Warranty & Campaign Check** panel shows:
   - 🟢 *Vehicle is under warranty — Expires …, … km remaining. The warranty officer will be notified and a warranty
     case opened.*
   - 🔴 *Open recall: RC-2026-014*
   - the acknowledgement box
5. Fill in a job number (e.g. `JC-TEST-001`) and the complaint "Engine warning light on, rough idle when cold".
   ✅ **Create Job Card** is **disabled** until you tick the acknowledgement. Tick it, then create.
6. **Expected results:**
   - ✅ Toasts: "Job card JC-TEST-001 created" and "Warranty case WTY… opened".
   - ✅ You land on the job card. It shows the header (Customer, Vehicle + VIN, **Mileage at check-in**, Technician,
     Complaint) and a **Warranty at creation** card:
     - **Active**
     - expiry and km remaining
     - "Snapshot taken when the job card was created…"
     - "Acknowledged by …"
     - a link to **Warranty case WTY… · Open**
   - ✅ **Linked campaigns**: RC-2026-014 · **Scheduled**.
   - ✅ The **warranty officer's** bell shows "Warranty job opened" with customer, phone, car, VIN, km, job card,
     branch, complaint and case number.
   - ✅ The adviser gets "Open campaign on this vehicle…".
   - ✅ On the campaign page, this vehicle is now **Scheduled** and the Job card column is filled in after completion
     (T8).
7. **Negative tests:**
   - ❌ New job card with a **lower** mileage → "lower than the last recorded …". Tick **Odometer was replaced**, give a
     reason, and it is accepted. ✅ The snapshot card shows the odometer note.
   - ❌ Pick a vehicle with **no model or sale date** → 🟠 "Warranty could not be confirmed". **No acknowledgement
     needed**, and after creating: **no case** is opened, and the snapshot says **Unknown**.
   - ❌ (Swagger) `POST /service/job-cards` for the Sportage with `"warrantyAcknowledged": false` → **409** with
     `"code": "WARRANTY_ACK_REQUIRED"` and the check in `details`. This proves the server enforces it.
8. **Snapshot test:** change the Sportage model's km limit in Settings to 10,000. ✅ The vehicle page now says
   *Expired (km)*, but the job card's **Warranty at creation** still says **Active**. Put it back to 100,000.

## T6. Parts & Labour, who pays, and the invoice

*On the job card from T5. The adviser can add labour; issuing a part needs a store manager or admin.*

1. **Add labour:** operation `HRN-01`, "Harness inspection", 1.2 h, rate 15000.
   ✅ Charge to = **Free – RC-2026-014** (blue), because the campaign covers HRN-01. Hover the ⓘ to see *"Default:
   covered by campaign RC-2026-014"*.
2. **Add labour:** `SRV-60K`, "Periodic service 60k", 2 h, 24000. ✅ Charge to = **Customer**.
3. **Add part** (log in as `store.lagos` / Store@123 or super admin; the branch must have stock):
   - Issue the **warranty-applicable** part from T1. ✅ It appears as **Warranty**, priced at the **warranty rate**.
   - Issue the **non-applicable** part. ✅ It appears as **Customer**, priced at the retail rate.
4. **Totals box:** ✅ Customer / Warranty (claim) / Goodwill / Free are each summed. *Customer invoice total = Customer
   + 7.5% VAT*, with "Only lines charged to the customer are invoiced."
5. **Change who pays:**
   - On the non-applicable part, the dropdown **doesn't offer Warranty**. (Through the API it is refused: "not
     warranty-applicable".)
   - As the **adviser**, Goodwill is not offered. As the **warranty officer**, choose **Goodwill**: a dialog asks for a
     reason. ✅ After saving, the ⓘ shows "Changed by … : reason".
6. **Generate invoice** (top button, or the button under the table). ✅ The confirm dialog shows the customer total.
   Confirm. ✅ "Invoice INV… created". Open **Invoices**: subtotal = **Customer lines only**, tax = 7.5%.
7. ✅ After invoicing:
   - The customer lines show a 🔒 lock, and their charge type can no longer change.
   - The top **Generate Invoice** button disappears.
   - ❌ A second invoice is refused ("already invoiced").
8. ❌ Try the old manual **Invoices → New invoice** with this job card. ✅ It is refused: *"This job card has priced lines.
   Use Generate invoice…"*.

## T7. Warranty case workflow (the officer's workbench)

*Warranty officer.*

1. Go to **Warranty** in the sidebar. ✅ KPI cards show Open, In review, Submitted to Kia (₦ claimed),
   Approved (30 days), and Rejected/Returned.
   - Try the filters: status pills, date range with **Based on** (Case date or Bill date), **Claim no.**
     (Generated / Not generated), **Billing** (Billed / Unbilled), branch, and search by case, job, VIN or customer.
   - **Export ▾** gives CSV and Excel.
2. Open the case from T5. ✅ The stepper shows **Open ✓**, with In review next. The header shows the job card link, job
   date, **Bill date** (from the invoice in T6), and the vehicle and customer cards.
3. **Claim details:** click "Add complaint code" (or the pencil next to Kia claim no.) and choose `C104 Engine misfire`.
4. **Lines:**
   - Click **Import job card lines**. ✅ The job card's **Warranty** lines are copied in. The first part becomes the
     **Causal part**. Non-applicable parts are skipped, with a warning toast.
   - Or add them by hand: **Add causal part** (search the applicable part; non-applicable parts are greyed out "Not
     applicable"; choose defect `D07`, position `P03`, batch `B2208`, qty 1). Then **Add consequential part**, and
     **Add labour** (e.g. "Engine diagnosis", 1.5 h × 15000).
   - ✅ **Add causal part** is disabled once one exists (only one causal part per claim).
   - ✅ **Claim Summary → Claimed total** updates.
5. **Start review.** ✅ The stepper moves to In review, and the status history gets a row.
6. ❌ **Guard tests before submitting:**
   - Remove the defect code from a part line → **Submit** → "Every part line needs a defect code".
   - Delete the causal part → "Add the causal part…".
   - Put them back.
7. **Submit to Kia:** enter a Kia claim no. (e.g. `KNG-WC-558213`), then Submit.
   - ✅ The status is **Submitted**, lines are now locked (no add or edit buttons), and the Kia claim no. shows in the
     header.
   - ✅ The adviser who created the job card and the branch **workshop manager** get "Warranty case submitted…".
8. **Record decision** (opens the screen 07 dialog):
   - **Partially approved**: set 60% on one line. ✅ The row highlights amber, and the footer shows "Claimed ₦X →
     Approved ₦Y (Z%)".
   - Save. ✅ Status **Partially approved**, and the Approved (₦) column fills in.
9. **Record settlement:** enter a reference (e.g. `CN-2026-0091`), amount and date. ✅ **Settled**. Then **Close
   case**. ✅ **Closed**, and the stepper is complete.
10. **Other paths to try on another case:**

    | Path | Steps | Expected |
    |---|---|---|
    | **Reject** | Submit, then **Reject** | A **reject reason** is required; status becomes Rejected and Approved = ₦0; then **Close case** |
    | **Return** | Submit, then **Return for correction** | Remarks are required; status becomes Returned with an orange note; **Resume review** goes back to In review and you can edit again |
    | **Withdraw** | On an Open case, **Withdraw** | A reason is required; status becomes Closed |
    | **Manual open** | Warranty list → **Open case** → search a job card that was *Unknown* | A case is opened for it (after you verified the warranty) |

11. **Concurrency (optional):** open the same Submitted case in two tabs and click **Record decision → Save** in both.
    ✅ One succeeds; the other says "changed by someone else, refresh".
12. ✅ The **Status History** at the bottom lists every step, with person, date and time, and remarks.

## T8. Campaign outreach and completion

*Receptionist or reception manager (outreach), and the workshop manager (completing the job card).*

1. Open the campaign. ✅ It shows:
   - tiles: Affected, Pending, Contacted, Scheduled, Completed, Not reachable/applicable
   - a stacked progress bar
   - **Progress by branch**
   - the unmatched VIN warning
2. **Affected vehicles** table. Filter by status pills, by branch, and search by VIN, customer or phone.
3. On a **Pending** vehicle, click **Log contact**: Channel = Phone, Outcome = "No answer". Save.
   ✅ Attempts = 1 and "Last contact: Today · No answer". The status is still **Pending**.
4. **Log contact** again with Outcome "Reached — customer agreed to visit". ✅ Status becomes **Contacted**.
5. **Schedule:** expand **Schedule appointment**, pick a date and time and the branch (the note is pre-filled
   "Recall RC-2026-014 — …"), then **Save & schedule**.
   - ✅ The status is **Scheduled**.
   - ✅ A new appointment appears in **Appointments** with that note.
6. ✅ The **Not in system** row has its buttons disabled.
7. **Bulk:** tick two rows, then **Mark not applicable**. ✅ Both become **Not applicable**. Use **Back to pending**
   (row ⋯ menu) to undo.
8. **Completion:** as the **workshop manager** (`wm.lagos`) or super admin (advisers don't have `jobcard:update`), open
   the job card from T5 and set its status to **Completed** (Repairs/Workshop progress, or edit the job card).
   - ✅ On the campaign page, that vehicle becomes **Completed** and the **Job card** column links to it.
   - ✅ The tiles and branch percentages update.
9. **Late registration:** register a new vehicle (Vehicles → New) with the VIN `KNAPU81BDP7000099` from T3.
   ✅ The campaign's unmatched count drops by 1, and the row now shows the customer.
10. **Close campaign.** A warning shows how many are still outstanding. ✅ After closing, the vehicle pages no longer
    show it under Open Campaigns.

## T9. Permissions (who sees what)

Log in as each role and check:

| Role | Warranty menu | Campaigns menu | Can create campaign | Outreach buttons | Change charge type | Goodwill |
|---|---|---|---|---|---|---|
| Warranty officer | ✅ + Settings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Service adviser | ✅ (read only) | ✅ (read) | ❌ | ❌ | ✅ | ❌ |
| Receptionist | ✅ (read only) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Technician | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Also check these:

- The technician opening `/warranty` directly gets the "no access" screen.
- Calling a warranty API with the technician's token returns **403**.
- **Settings → Roles** shows the new **WarrantyOfficer** role, and the permission groups **Warranty** and
  **Campaigns (Recall / Free Fix)**.

## T10. Customer portal

Log in to the customer portal as the Sportage's owner (seed customers use `Customer@123`).

- Open **My vehicles** and the vehicle. ✅ **Warranty status** shows the *calculated* value, e.g. "Under warranty".
  The provider is "Manufacturer" and the expiry is the calculated date.
- The customer can no longer type their own warranty status when registering a vehicle.

## T11. Legacy data migration (optional, for the data lead)

```bash
cd server
npm run legacy:warranty -- --dir /path/to/csv-exports            # dry run → report in <dir>/report
npm run legacy:warranty -- --dir /path/to/csv-exports --apply    # import (safe to re-run)
```

1. Put the legacy CSV exports in one folder: `model.csv`, `vehiclemaster.csv`, `partmast.csv`, `warrcomp.csv`,
   `warrdef.csv`, `warrpos.csv`, `warrrej.csv`. Any file can be missing.
2. Run the dry run. Open the `.md` report. It lists:
   - rows to create, update or skip
   - **VINs not in the system**
   - **vehicles with no sale date** (they will show Unknown)
   - **sale-date conflicts** (never overwritten unless `--overwrite-dates`)
   - **no matching model**
   - **parts not in Part Master**
   - what is **not migrated** (legacy claims, old free-text fields)
3. Run `--apply` **on a local copy first**. Running it a second time should show everything as "unchanged".

## Automated tests (run before the demo)

```bash
cd server
npx tsc --noEmit                                     # type check
npx jest warranty campaign jobCardLine legacyImport  # rules: coverage, transitions, VINs, charge types, CSV
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest warranty.integration
cd ../client && npm run lint && npm run build
```

Never point `TEST_DATABASE_URL` at the shared dev database.

---

# Part 3: For the scrum meeting

## Status update (about 30 seconds)

> "The warranty and campaigns issue is implemented end to end and verified, not yet merged.
> - Warranty is now **calculated** from the model policy, sale date and odometer, never typed.
> - The adviser gets a warranty and recall banner at check-in and on the new job card page, and must acknowledge it;
>   the server enforces that too.
> - Covered jobs automatically open a warranty case for the new Warranty Officer role, with the full Kia claim
>   workflow: submit, approve, partial, reject, return, settle.
> - Every job card line now says who pays (customer, warranty, goodwill or campaign), and invoices only bill the
>   customer's lines.
> - Recalls and free fixes are created from Kia's VIN lists, with outreach, scheduling, and automatic completion when
>   the job card is done.
>
> 272 automated tests pass, including database tests. Lint and build are clean. All 13 screens match the approved
> designs."

## Demo script (about 5 minutes)

1. **Warranty Settings**: the Sportage policy is 5 years / 100,000 km. (T1)
2. **Vehicle page**: Active, the time and km meters, and the open recall card. (T2, T3)
3. **New Job Card**: enter the mileage; show the green and red banners; *Create* stays disabled until the box is ticked;
   create the job card. (T5)
4. **Switch to the warranty officer**: the bell notification, the new case, import lines, submit, record a partial
   decision. (T7)
5. **Job card**: the Parts & Labour charge types, and *Generate invoice* billing only the customer lines. (T6)
6. **Campaign page**: progress by branch, log a call, schedule; complete the job card and the campaign updates. (T8)

## Decisions made (the team should know)

- Warranty ends at the **date or km limit, whichever comes first**. Missing data means **Unknown**, never covered.
- Warranty officers are **per branch**. If a branch has none, all officers are notified.
- **Goodwill** needs the warranty officer (`warranty:update`) and a reason.
- Job card lines (parts and labour), invoice lines and **invoice generation from the job card** were added. The issue
  needed them for "invoice includes only customer lines".
- **PDI** (pre-delivery inspection) is out of scope.
- Legacy data is imported from **CSV exports**, with a dry-run report first.
- Two permissions were added beyond the issue: `warranty:settings` and `jobcard:line:update`.

## Risks and follow-ups

- The old free-text `Vehicle.warrantyProvider/Status/ExpiresAt` columns are unused now. Drop them in a later migration.
- **The data team needs to export the legacy tables to CSV** and run the dry run. Many legacy vehicles have no sale date
  and will show *Unknown* until it is filled in.
- **A job card for a vehicle now requires the mileage.**
- **Behaviour change: manual invoices are blocked** for job cards that have priced lines.
- **Global style fix:** a CSS rule was overriding all button and input font sizes. It's fixed, so some existing buttons
  look slightly smaller (as originally designed).

## Troubleshooting

| You see | Why | Fix |
|---|---|---|
| **404** on `/api/warranty/...` or `/api/campaigns/...` | The backend was started before the new code | Restart `npm run dev` in `server/` |
| **403** on warranty or campaign pages | The login token predates the new permissions | Log out and back in |
| **409 WARRANTY_ACK_REQUIRED** | The vehicle is covered or has an open campaign and wasn't acknowledged | Tick the acknowledgement box |
| "Mileage … lower than the last recorded" | The odometer only goes forward | Enter the real reading, or tick *Odometer was replaced* with a reason |
| The vehicle shows **Unknown** | No model, sale date or mileage | Link the model and set the sale date (Edit vehicle) |
| A campaign doesn't show on the vehicle | The campaign is Draft or Closed, outside its dates, or the VIN differs | Activate it, and check the dates and VIN |
| "Nothing to invoice" | No line is charged to the customer | Expected for fully warranty or campaign jobs |
