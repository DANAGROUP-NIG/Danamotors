# Job card UX revamp: design prompts

Reference designs for the job card lifecycle redesign. Each prompt below produces one screen mockup in ChatGPT. Use the images as layout and flow references when rebuilding `client/app/(dashboard)/job-cards/[id]`. The copy and rules in this file win over anything the images get wrong.

## Confirmed decisions (25 Nov 2026)

The concept is "one job, one step, one owner". At any moment one person holds the job. The screen shows that person only what they need to finish their step, and one button passes the job to the next person.

| # | Stage | Owner | Hands over to |
|---|---|---|---|
| 1 | Check-in: details, walk-around, customer consent and signature | Service advisor | Workshop supervisor |
| 2 | Diagnosis: supervisor assigns technician and bay; technician records findings, work and parts; service engineer confirms | Supervisor, technician, service engineer | Warranty officer, or the service advisor when nothing is warranty related |
| 3 | Warranty check (only when the vehicle is in warranty, has an open campaign, or an item is flagged "possible warranty") | Warranty officer | Service advisor |
| 4 | Estimate and approval: estimate, item-by-item approval and signature (or recorded phone approval), advance, release | Service advisor, cashier | Technician |
| 5 | Repair: parts collected with signature, job tick-list, labour, new findings go to a supplementary estimate | Technician | Supervisor |
| 6 | Quality check: checklist, road test, certified roadworthy | Supervisor or service manager | Service advisor (pass) or technician (fail) |
| 7 | Billing: mark ready and notify customer, wash tick, estimated vs actual, invoice, payment | Service advisor, cashier | Service advisor |
| 8 | Delivery: work explained, belongings returned, customer signature, gate pass | Service advisor | Closed, PSF follow-up |

Rules confirmed:
- Two customer signatures before work: check-in consent (findings and terms) and estimate approval. A customer who leaves can approve by phone. The advisor records who, which phone number, when and which items, and the customer signs the estimate at delivery.
- Anyone other than the owner signs as "Representative" with name and phone. The vehicle is released only to the owner or the person who signed (terms clause 7).
- Approval is item by item. Declined items are saved as "Recommended, declined" and shown at the next visit.
- If the customer declines everything, the system proposes the estimation charge from terms clause 4 (₦25,000 or 10%). The advisor can waive it only with manager approval and a reason.
- Storage charge (clause 3): a counter starts when the customer is notified the vehicle is ready. After 48 hours the system proposes ₦2,000 per day at billing. It is never added silently.
- The cashier records the advance. Warranty, free service, campaign, internal and credit-approved jobs are exempt.
- Parts on the approved estimate become a store request automatically. The store issues them and the technician signs on collection. Extra parts need a supplementary estimate.
- Payment comes before delivery, except for credit-approved customers. The screen names who approved the credit.
- Washing is a tick box in Billing, not a stage.
- PDI keeps its own flow. Repeat flag shows at check-in, late reasons at delivery, PSF and CSC links in the Job file panel.
- Devices: advisors use desktop and tablet; technicians and supervisors use phone or tablet; warranty, store and cashier use desktop.
- Printed job card follows the paper form layout, with the 12 terms on the back and a separate gate pass slip.

Warranty eligibility, confirmed with the warranty lead (Reading A, maintenance compliance):
- Coverage is 5 years or 100,000 km from the sale date, whichever comes first (existing check).
- In every warranty year since sale, counted from the sale date, the vehicle must be serviced at least every 3 months or every 5,000 km, whichever comes first. That is about 4 services a year.
- A gap longer than either limit is a missed service. Years are counted from the sale date.
- Only service types flagged as periodic maintenance count.
- Services at another authorised Kia dealer count. The officer adds them with a photo of the stamped service book.
- Grace is a setting, default none. `TODO(confirm)` the grace value with the warranty lead.
- The system shows the verdict and the evidence, and the warranty officer decides. An irregular history needs a written reason before any item is approved as warranty. It is never an automatic rejection.
- The 3 months, 5,000 km, 4 services a year and grace values are stored in Warranty settings, configurable per model.

## How to use these prompts

1. Open a new ChatGPT chat with image generation.
2. Paste Prompt 0 first. It sets the visual system, the job card concept and the sample data. ChatGPT should reply "Ready".
3. Paste one screen prompt at a time, in order. Each prompt states the device size.
4. If the style drifts (colours, fonts, extra decoration), paste Prompt 0 again, then repeat the screen prompt.
5. Image models misspell small text. Judge the layout and hierarchy from the image and take the wording from this file.

---

## Prompt 0: shared brief (paste first)

```
You are a senior product designer creating high-fidelity UI mockups for Dana Motors FMS, an internal workshop management web app used all day by a Kia dealer's service centres in Lagos, Nigeria. Users are service advisors, technicians (often on phones or tablets, with dirty hands), workshop supervisors, a service engineer, a warranty officer, store staff, cashiers and managers. Many users have limited computer experience. The screens must look like a finished, professionally designed business application: calm, clear, dense but never cluttered. Not a marketing site and not a generic AI dashboard.

I will send one screen at a time. Keep every screen consistent with this brief. Reply only "Ready" now and do not create an image yet.

VISUAL SYSTEM (use exactly)
- Page canvas: very light slate #F1F5F9. Cards and panels: white #FFFFFF with a 1px border #DBE3EF.
- Primary: near-black navy #05141F for primary buttons, the active step, selected tabs and focus rings. Primary button text is white.
- Secondary buttons: white with #DBE3EF border and #0F172A text. Secondary surface: #E6EAED.
- Body text #0F172A. Secondary text #64748B.
- Status appears only as soft badges, always with a text label: pale tint background, darker text, thin border. Amber = waiting or open, blue = in progress or quality check, emerald = done, approved or ready, red = failed, declined or overdue, purple = warranty, gray = closed or skipped.
- Destructive red #DC2626 only for destructive actions and error text.
- Font: system UI sans serif (Segoe UI or SF Pro look). Page title 20px semibold, section title 16px semibold, body 14px, helper text 12 to 13px. Numbers use tabular figures. Money is right-aligned in tables.
- Corners: cards 12px, inputs and buttons 8px. No heavy shadows; separate areas with borders and whitespace.
- Icons: Lucide line icons only, 16 to 20px, vertically aligned with text.
- 8px spacing grid with generous space between sections. One primary button per area.
- Touch targets at least 44px on tablet and phone screens.

NEVER USE
Gradients, glassmorphism, neon colours, emojis, typed Unicode symbols as icons (use line icons instead), lorem ipsum, stock photos of people, decorative illustrations, em dashes in copy, exclamation marks, ALL CAPS labels. Use sentence case everywhere.

FORMATS
- Money: naira sign, comma thousands, two decimals, for example ₦152,112.50.
- Dates and times (Lagos time): 25 Nov 2026, 09:15. Relative time where helpful: "in 5 h", "2 days ago".
- Distance: 48,250 km.
- Missing values: muted text "Not provided".

APP SHELL
Left sidebar navigation in navy with icons and labels (collapsible to icons). Slim white top header with a global search field "Search plate, VIN, phone or job number", the branch name "Isolo" and the user's initials avatar. On phones the sidebar becomes a menu button and the content is single column.

JOB CARD CONCEPT: one job, one step, one owner
1. Job header, fixed at the top of every job screen. Shows:
   - job number 2026000127, plate KJA 482 TX, "Kia Sportage 2023, white";
   - customer "Adaeze Okafor, 0803 555 0142";
   - a status badge and a "Warranty" or "Non-warranty" tag;
   - a line "With: <name> (<role>) since <time>";
   - promised delivery "Thu 28 Nov, 4:00 pm" with a countdown;
   - on the right, a "Job file" button and a "Print" dropdown.
2. Stepper with 8 steps under the header: 1 Check-in, 2 Diagnosis, 3 Warranty, 4 Estimate, 5 Repair, 6 Quality check, 7 Billing, 8 Delivery.
   - Completed step: filled navy circle with a check icon and a small caption "Chidi Eze, 25 Nov 09:40".
   - Current step: navy ring and bold label.
   - Upcoming steps: gray.
   - Skipped step: gray with the caption "Skipped".
   - On phones the stepper collapses to "Step 5 of 8: Repair" with a thin progress bar and a tap-to-expand list.
3. Only the current stage's content is shown. Earlier stages appear above it as one-line collapsed summaries, for example "Check-in completed by Chidi Eze, 25 Nov, 09:40. Signed by customer." They expand read-only.
4. Sticky bottom action bar holding:
   - one primary handoff button that names the next person, for example "Send to workshop supervisor";
   - secondary actions on the left ("Save draft", a "More" menu).
   - A disabled primary button shows a one-line reason beside it.
5. Alert strip under the stepper, only for blocking or important items (maximum 3). Each alert has a line icon, one plain sentence and an action link.
6. "Job file" opens a right drawer, 480px wide, with tabs: Customer and vehicle, Visit history, Warranty and campaigns, Documents and prints, Activity.
7. People who do not own the current step see it read-only with a banner "Waiting for Musa Abdullahi (Technician)".

Status badge labels: Check-in, Diagnosis, Warranty check, Awaiting approval, In repair, Waiting parts, Quality check, Ready, Delivered, Cancelled.

SAMPLE DATA (fictional; use the same data on every screen)
- Job 2026000127, Isolo branch, opened 25 Nov 2026, 09:15, created from booking BK-2026-000318.
- Vehicle details:
  - Kia Sportage 2.0 petrol automatic, 2023, white;
  - plate KJA 482 TX, VIN KNAPU81BDP7123456, engine G4NA 0034567;
  - sold 14 Mar 2023 by Dana Motors Isolo;
  - odometer 48,250 km (previous visit 43,100 km on 12 Aug 2026).
- Customer: Adaeze Okafor, individual, 0803 555 0142.
- Customer requests:
  - (1) "Noise from front left wheel when braking";
  - (2) "AC not cooling well";
  - (3) "Periodic service (50,000 km)".
- Staff:
  - service advisor Chidi Eze;
  - workshop supervisor Tunde Bakare;
  - technician Musa Abdullahi;
  - service engineer Kelechi Nwosu;
  - warranty officer Ngozi Adeyemi;
  - cashier Bisi Lawal;
  - store keeper Ibrahim Sule.
- Bay A2. Promised delivery Thu 28 Nov 2026, 4:00 pm.
- Estimate lines:
  - Periodic service labour ₦25,000.00 (customer)
  - Engine oil 5W-30, 4.5 L ₦38,000.00 (customer)
  - Oil filter ₦6,500.00 (customer)
  - Air filter ₦12,000.00 (customer)
  - Front brake pads set ₦45,000.00 (customer)
  - Brake pad replacement labour ₦15,000.00 (customer)
  - AC compressor ₦480,000.00 (warranty)
  - AC compressor replacement labour ₦30,000.00 (warranty)
  - AC refrigerant recharge ₦18,000.00 (warranty)
- Customer subtotal ₦141,500.00, VAT 7.5% ₦10,612.50, customer total ₦152,112.50.
- Warranty total ₦528,000.00, claimed from the manufacturer and not charged to the customer.
- Suggested advance 60% = ₦91,267.50.
```

---

## Prompt 1: Check-in, step A, details and requests

```
Screen 1 of 19. Device: desktop, 1440 x 900. User: service advisor Chidi Eze. Use the shared brief.

Goal: the advisor has just opened job 2026000127 from booking BK-2026-000318 and confirms the details before walking round the car.

Layout:
- App shell, job header and stepper. Status badge "Check-in". "With: Chidi Eze (Service advisor) since 09:15". Stepper on step 1.
- Inside the Check-in stage, a small 3-part segmented progress: "Details" (current), "Walk-around", "Customer consent".
- Left column (60%):
  - Card "Customer and vehicle": compact read-only summary with an "Edit" text link. Name, phone, vehicle, plate, VIN, sold date. A "Bill to" select showing "Adaeze Okafor (owner)".
  - Card "Visit details":
    - Mileage input, required, value 48,250, unit "km", helper text "Last recorded 43,100 km on 12 Aug 2026".
    - Service type select "Periodic service".
    - Promised delivery date and time picker "Thu 28 Nov 2026, 4:00 pm".
- Right column (40%):
  - Card "Customer requests", carried over from the booking: three numbered editable rows with the sample requests, a small "Complaint code (optional)" select on each, and a "Add request" text button.
  - Below it, card "Instructions to technician": a textarea with a visible label and helper text "Visible to the workshop. Write what you want checked."
- Alert strip, two items:
  - Info, line icon: "Not a repeat visit. Last visit 12 Aug 2026, periodic service."
  - Amber, shield icon: "Service history has 1 missed service in warranty year 2. Warranty items will need the warranty officer's review." with link "View history".
- Sticky bottom bar: left "Save draft"; right primary "Continue to walk-around".

Show required markers (small red asterisk plus "Required" in helper text) and clear labels above every field.
```

## Prompt 2: Check-in, step B, walk-around

```
Screen 2 of 19. Device: tablet landscape, 1024 x 768. User: service advisor at the vehicle. Use the shared brief.

Goal: record the vehicle's condition with taps, not typing.

Layout:
- Compact job header, stepper on step 1, segmented progress on "Walk-around".
- Top left card "Fuel level": large 5-segment selector E, 1/4, 1/2, 3/4, Full, with 1/2 selected in navy.
- Top right card "Body and paint":
  - a clean top-down line drawing of a car outline;
  - two placed markers: a "S" marker on the rear bumper and a "D" marker on the front right door, each a small round badge;
  - a legend: C Crack, D Dent, S Scratch;
  - a row of two photo thumbnails linked to the markers;
  - helper text "Tap the car to mark damage".
- Middle card "Checklist": a grid of large toggle chips, each showing the item name and a state (Present in emerald with check icon, Missing in red with x icon, Not working in amber).
  - Items: Service book, Registration documents, Jack and handle, Tool kit, Floor mats, Mud flaps, Hub caps, Stereo, Speakers, Antenna, Clock, Side mirrors, Headlamps, Indicators, Brake lights, AC working, Power windows, Central lock, Reverse lamp, Wiper blades, Spare wheel, Monogram, Battery, Engine warning lamp, Fire extinguisher.
  - Show "Hub caps" as Missing and "AC working" as Not working. Everything else Present.
- Card "Service book": toggle "Service book seen" on, and "Stamps for this warranty year: 3".
- Card "Personal belongings": a checkbox "No valuables left in the vehicle" and a short text field "Items left: Umbrella in boot".
- Card "Photos": 5 slots labelled Front, Rear, Left, Right, Odometer, with 4 filled thumbnails and one empty slot with a camera icon.
- Sticky bottom bar: "Back" secondary; primary "Continue to customer consent".
```

## Prompt 3: Check-in, step C, customer consent and signature

```
Screen 3 of 19. Device: tablet portrait, 768 x 1024. Show two frames side by side.

Frame 1: customer-facing consent. The advisor hands the tablet to the customer.
- Larger text (16px body). No internal information, prices or staff notes.
- Title "Please confirm your vehicle details".
- Summary card:
  - vehicle and plate;
  - mileage 48,250 km;
  - fuel level half;
  - damage noted: "Scratch on rear bumper, dent on front right door";
  - missing: hub caps;
  - your requests (3 lines);
  - promised delivery Thu 28 Nov, 4:00 pm.
- Card "Terms and conditions": a scrollable box with 12 numbered clauses. Show the first three legibly:
  1. "The vehicle is driven and tested, including test drives outside the workshop, at the customer's risk."
  2. "Delays caused by events outside our control may extend the delivery date."
  3. "The customer will collect the vehicle within 48 hours of being told it is ready. After that, storage is charged at ₦2,000.00 per day."
  Below the box, a checkbox "I have read and accept the terms and conditions".
- "Who is signing": segmented control "Owner" (selected) or "Representative". When Representative is chosen, fields for name, phone and relationship would appear; show them collapsed.
- Signature pad: a large white box with a light baseline and a "Clear" text button. Show a sample handwritten signature.
- Full-width primary button "Sign and accept".

Frame 2: the advisor's view after signing.
- Emerald success panel with a check line icon: "Signed by Adaeze Okafor, 25 Nov 2026, 09:40".
- Links "View signed copy" and "Print".
- Check-in segmented progress all complete.
- Sticky bottom bar primary "Send to workshop supervisor" and a helper line "Tunde Bakare will assign a technician and bay."
```

## Prompt 4: Diagnosis, supervisor assigns technician and bay

```
Screen 4 of 19. Device: desktop, 1440 x 900. User: workshop supervisor Tunde Bakare. Use the shared brief.

Goal: assign the right technician and bay quickly.

Layout:
- Job header with status "Diagnosis", "With: Tunde Bakare (Workshop supervisor) since 09:42". Stepper on step 2.
- Collapsed summary above the stage: "Check-in completed by Chidi Eze, 25 Nov, 09:40. Signed by customer."
- Left card "What the customer asked for": the 3 requests and the advisor's instructions to the technician.
- Right card "Assign technician": a list of technicians as selectable rows.
  - Each row: name, skill tags (for example "Brakes", "AC", "Engine"), jobs in hand today shown as a number and a small bar, and a status badge (Available, Busy, On leave).
  - Musa Abdullahi selected: Available, AC and Brakes skills, 1 job in hand.
  - Show 5 technicians in total.
  - Below the list, a "Bay" select showing "Bay A2 (free)" and an optional "Note to technician" field.
- Sticky bottom bar primary "Assign and send to Musa Abdullahi".
```

## Prompt 5: Diagnosis, technician findings on a phone

```
Screen 5 of 19. Device: phone, 390 x 844. User: technician Musa Abdullahi. Use the shared brief.

Goal: record what is wrong, the work needed and the parts needed, with big touch targets and little typing.

Layout:
- Compact header: "KJA 482 TX, Kia Sportage" and job number in small text, badge "Diagnosis". Under it "Step 2 of 8: Diagnosis" with a thin progress bar.
- Instruction from the advisor in a muted card.
- One card per customer request, stacked. Card 1, "Noise from front left wheel when braking", expanded:
  - "What did you find?" text area with a microphone icon button for voice input, filled with "Front pads worn to 2 mm, disc surface fine".
  - Photo row with 2 thumbnails and an "Add photo" tile.
  - "Work needed": a chip "Replace front brake pads" and an "Add work" button that opens a search.
  - "Parts needed": row "Front brake pads set, qty 1" with a stepper, and "Add part".
  - Toggle "Possible warranty", off.
- Card 2 "AC not cooling well" collapsed. It shows a summary line "Compressor clutch not engaging" and a purple "Possible warranty" badge.
- Card 3 "Periodic service (50,000 km)" collapsed with "Standard service items added".
- Large outline button "Add a finding the customer did not mention".
- Sticky bottom bar: full-width primary "Send to service engineer". The supervisor's name appears small beneath it.
- No prices anywhere on this screen.
```

## Prompt 6: Diagnosis, service engineer review

```
Screen 6 of 19. Device: desktop, 1440 x 900. User: service engineer Kelechi Nwosu. Use the shared brief.

Goal: confirm the technician's diagnosis before it goes to warranty or the advisor.

Layout:
- Job header with status "Diagnosis". Stepper on step 2.
- Collapsed summaries for Check-in and "Technician assigned: Musa Abdullahi, Bay A2".
- Main card "Diagnosis by Musa Abdullahi": a table grouped by customer request.
  - Columns: Finding (cause and nature of defect), Work needed, Parts needed, Photos, Possible warranty.
  - The AC row has a purple "Possible warranty" badge.
  - Each row has an "Edit" icon button with a tooltip.
- Side card "Routing":
  - "1 item is flagged as possible warranty. This job goes to the warranty officer next."
  - A muted note: "Jobs with customer-pay items only go straight to the service advisor."
- Sticky bottom bar: secondary "Return to technician" (requires a note); primary "Confirm and send to warranty officer".
```

## Prompt 7: Warranty check

```
Screen 7 of 19. Device: desktop, 1440 x 900. User: warranty officer Ngozi Adeyemi. Use the shared brief.

Goal: decide who pays for each item, with the evidence on one screen.

Layout:
- Job header with status "Warranty check" and a purple "Warranty" tag. Stepper on step 3.
- Top row, two cards side by side.

Card "Coverage", emerald badge "Active":
- "Sold 14 Mar 2023. Expires 14 Mar 2028."
- Two horizontal progress bars: "Time used: 3 years 8 months of 5 years" and "Distance: 48,250 of 100,000 km".

Card "Service history", amber badge "1 missed service":
- Helper text "Service at least every 3 months or 5,000 km, whichever comes first."
- A timeline with four rows, one per warranty year (Year 1: Mar 2023 to Mar 2024, Year 2: Mar 2024 to Mar 2025, Year 3: Mar 2025 to Mar 2026, Year 4: current, in progress).
- Each row has 4 quarter blocks. Each block shows the service date and "km since last service", with an emerald "On time" or red "Missed" badge.
- Year 2, quarter 2 block is red "Missed". Its detail reads "4 months 2 weeks and 6,300 km since the last service".
- Year 4 shows 3 blocks done and 1 upcoming in gray.
- Text button "Add outside service record".

Card "Campaigns and recalls": "No open campaigns for this vehicle."

Main card "Items to decide": a table of all diagnosed lines.
- Columns: Item, Type (Part, Labour, Oil), Technician's note, Decision.
- Decision is a segmented control: Warranty, Goodwill, Campaign, Customer pay.
- The three AC lines are set to Warranty in purple. Below them, a required field "Reason (needed because service history is not regular)" filled with "Missed service in year 2 is not related to the AC system".
- The other lines are set to Customer pay.

Sticky bottom bar primary "Return to service advisor", with a helper line "Chidi Eze will prepare the estimate".
```

## Prompt 8: Estimate, advisor builds it

```
Screen 8 of 19. Device: desktop, 1440 x 900. User: service advisor Chidi Eze. Use the shared brief.

Goal: turn the diagnosis and warranty decisions into a clear estimate.

Layout:
- Job header with status "Awaiting approval". Stepper on step 4.
- Collapsed summaries for Check-in, Diagnosis and "Warranty check by Ngozi Adeyemi: 3 items under warranty".
- Small segmented progress inside the stage: "Prepare" (current), "Customer approval", "Advance and release".
- Main card "Estimate, revision 1, draft": a table grouped into two sections.
  - Section headers: "Customer pays" and "Warranty (not charged to customer)".
  - Columns: Description, Type, Qty or hours, Rate, Amount. Money is right-aligned with tabular figures.
  - Use all 9 sample lines. Each line has a "Remove" icon button with a tooltip.
  - "Add line" button under each section.
- Right summary panel, sticky:
  - Customer subtotal ₦141,500.00
  - VAT 7.5% ₦10,612.50
  - Customer total ₦152,112.50 (largest number on the screen)
  - Muted: Warranty total ₦528,000.00
  - "Suggested advance" with chips 20%, 30%, 60% (selected) and Custom, showing ₦91,267.50
  - "Estimated delivery Thu 28 Nov, 4:00 pm".
- Sticky bottom bar: "Save draft", secondary "Print estimate", primary "Present to customer".
```

## Prompt 9: Customer approval and signature

```
Screen 9 of 19. Device: tablet portrait, 768 x 1024. Show three frames.

Frame 1: customer-facing approval.
- Larger text. Title "Your estimate for KJA 482 TX".
- Short intro: "Approve the work you want us to do. You can decline any item."
- A list of customer-pay work grouped by request in plain words, each with a price and an Approve or Decline toggle.
  - "Air filter ₦12,000.00" is set to Decline and shown muted with a "Declined" gray badge.
- A note card: "Covered by warranty: AC compressor repair. No charge to you."
- A running total that updates: "You approve ₦139,212.50 including VAT".
- A line under it: "Declined items will be reminded at your next visit."
- Signature pad and Owner or Representative choice as on the consent screen.
- Full-width primary "Approve and sign".

Frame 2, desktop modal 640px wide: "Record phone approval".
- Fields: Approved by (name), Phone number (tel input), Date and time, a checklist of items approved, Note.
- Helper text "The customer will sign at delivery."
- Buttons "Cancel" and primary "Save phone approval".
- The modal has a close icon and does not close on outside click.

Frame 3: small advisor view when the customer declines everything.
- Amber alert: "The customer declined all work. An estimation charge of ₦25,000.00 applies (terms clause 4)."
- Buttons "Add estimation charge" (primary) and "Request waiver" (secondary). Helper text "A waiver needs manager approval and a reason."
```

## Prompt 10: Advance and release to workshop

```
Screen 10 of 19. Device: desktop, 1440 x 900. User: service advisor, with the cashier's entry visible. Use the shared brief.

Goal: show clearly that everything needed before work is in place.

Layout:
- Job header with status "Awaiting approval". Stepper on step 4. Segmented progress on "Advance and release".
- Card "Before work starts", a checklist of three rows, each with an icon, a sentence and who or when:
  1. Emerald check: "Customer approved 8 items, signed by Adaeze Okafor, 25 Nov, 12:05".
  2. Emerald check: "Advance received: ₦100,000.00 by bank transfer, receipt RCT-2026-004512, recorded by Bisi Lawal (Cashier), 25 Nov, 12:20".
  3. Emerald check: "Parts request sent to store automatically: 5 items. Store keeper Ibrahim Sule notified".
- Card "Advance": approved customer total ₦139,212.50, suggested 60% ₦83,527.50, received ₦100,000.00, balance at billing ₦39,212.50.
- Sticky bottom bar: primary "Release to workshop", helper line "Musa Abdullahi will be notified".

Below, add a second smaller frame showing the blocked state:
- Item 2 is amber: "Advance not received".
- The primary button is disabled, with the reason beside it: "Ask the cashier to record the advance. Cashier on duty: Bisi Lawal."
- A secondary button "Notify cashier".
```

## Prompt 11: Repair, technician on a phone

```
Screen 11 of 19. Device: phone, 390 x 844. Show two frames. User: technician Musa Abdullahi.

Frame 1: repair workspace.
- Compact header, badge "In repair", "Step 5 of 8: Repair".
- Card "Your work", a tick-list of approved work, each row with a big Start or Done button:
  - "Periodic service (50,000 km)": done, emerald, "Done 14:10".
  - "Replace front brake pads": in progress, blue.
  - "Replace AC compressor": purple Warranty tag, status amber "Waiting parts".
- Card "Parts":
  - "4 of 5 ready to collect at store" with a primary "Collect and sign" button.
  - "AC compressor: ordered, expected 27 Nov".
- Three large outline buttons in a row: "Need a part", "Add a finding", "Pause job".
- Sticky bottom: full-width primary "Send for quality check", disabled, with reason "Finish all work first: 2 items left".

Frame 2: bottom sheet "Collect parts".
- A list of 4 parts with quantities and checkboxes, all checked.
- Signature pad, with helper text "Your signature confirms you received these parts from Ibrahim Sule".
- Primary "Sign and collect".
```

## Prompt 12: Repair, advisor view and supplementary estimate

```
Screen 12 of 19. Device: desktop, 1440 x 900. User: service advisor Chidi Eze. Use the shared brief.

Goal: follow progress without calling the workshop, and handle a new finding.

Layout:
- Job header with status "In repair", "With: Musa Abdullahi (Technician) since 12:30". Stepper on step 5, read-only for the advisor.
- Banner at the top of the stage, amber, with a line icon:
  - "New finding from Musa Abdullahi: Rear wiper blade torn. The customer must approve before this work is done."
  - Primary button "Prepare supplementary estimate".
  - Helper text "Work already approved continues."
- Card "Work progress": the 3 approved work lines with status badges, technician, time spent and a thin progress bar.
- Card "Parts": a table with columns Part, Qty, Requested, Issued by store, Collected by technician, Status. One row reads "AC compressor: Ordered, expected 27 Nov".
- Card "Labour recorded": operation, hours, technician.

Also show a second frame: the supplementary estimate panel, "Estimate, revision 2".
- Only the new line: "Rear wiper blade ₦8,500.00".
- Buttons "Present to customer" and "Record phone approval".
```

## Prompt 13: Quality check

```
Screen 13 of 19. Device: tablet landscape, 1024 x 768. Show two frames.

Frame 1: quality check, used by workshop supervisor Tunde Bakare at the vehicle.
- Job header with status "Quality check". Stepper on step 6.
- Card "Approved work": each work line with Pass and Fail toggles. All three are set to Pass.
- Card "General checks", toggles:
  - No warning lights on dashboard
  - Fluid levels correct
  - Wheel nuts torqued
  - AC outlet temperature (number input with a °C unit label, value 6)
  - Vehicle interior clean
- Card "Road test": start km 48,262, end km 48,270, notes field.
- Card "Certification":
  - Text "Vehicle checked and certified as roadworthy in all respects".
  - Supervisor signature pad, signed.
- Sticky bottom bar: secondary outline in red "Fail and return to technician" (requires notes); primary "Pass quality check".

Frame 2, phone 390 x 844: what the technician sees after a failed check.
- Red banner "Returned by Tunde Bakare, 27 Nov, 15:00".
- The note "Brake still noisy at low speed. Recheck front left caliper slider."
- The work item "Replace front brake pads" reopened in blue "In repair".
```

## Prompt 14: Billing

```
Screen 14 of 19. Device: desktop, 1440 x 900. User: service advisor, with cashier actions. Use the shared brief.

Goal: tell the customer the car is ready, compare estimate with actual, and get paid.

Layout:
- Job header with status "Ready". Stepper on step 7.

Card "Customer notified": "SMS sent to 0803 555 0142 on 27 Nov 2026, 15:10" with "Send again".
- A small muted line beneath: "Storage charge of ₦2,000.00 per day starts after 29 Nov 2026, 15:10 (terms clause 3)."
- A tick box "Vehicle washed".

Card "Estimated and actual", a 4-column table modelled on the paper job card:
- Columns: Item, Estimated, Actual, Difference.
- Rows: Parts, Oil, Labour, Service charge, Total. Money is right-aligned.
- Actual is ₦8,500.00 higher for parts because of the approved wiper blade.

Card "Invoice":
- Customer total ₦148,350.00, advance paid ₦100,000.00, balance due ₦48,350.00 (largest).
- Payment status amber badge "Unpaid".
- Buttons: primary "Create invoice"; then "Record payment" for the cashier.

Muted side note: "Warranty claim of ₦528,000.00 will be sent by Ngozi Adeyemi".

Sticky bottom bar: primary "Send to delivery", disabled, with reason "Balance of ₦48,350.00 not yet paid".

Add a small second frame for the credit exception:
- Emerald note "Credit approved by Funmi Oladele (Service manager), 27 Nov, 15:30".
- The primary button enabled.
```

## Prompt 15: Delivery

```
Screen 15 of 19. Device: tablet portrait, 768 x 1024. Show three frames.

Frame 1: advisor and customer at handover.
- Job header with status "Ready". Stepper on step 8.
- Card "Work done", in plain words: three short lines, plus "Rear wiper blade replaced (added with your approval)".
- Card "Declined, recommended for next visit": "Air filter".
- Card "Your belongings": the check-in list (Service book, Registration documents, Jack and handle, Tool kit, Spare wheel, Umbrella in boot), each with a "Returned" checkbox, all ticked.
- Card "Collected by":
  - "Adaeze Okafor (owner)" with an emerald "Matches job card signer" badge.
- Signature pad with the statement "I am taking delivery of the vehicle and I am satisfied with the repairs."
- Primary "Complete delivery and print gate pass".

Frame 2: late delivery variant.
- Amber alert "Delivered after the promised time of Thu 28 Nov, 4:00 pm".
- Required "Reasons for late delivery" multi-select chips, choose 1 to 6. Selected: "Parts delayed", "Extra work approved by customer".

Frame 3: completed state.
- Emerald panel "Delivered to Adaeze Okafor, 28 Nov 2026, 15:20".
- "Gate pass GP-2026-001234" with "Print gate pass".
- Muted line "Follow-up call scheduled for 30 Nov 2026".
- All 8 stepper steps complete.
```

## Prompt 16: Workshop board

```
Screen 16 of 19. Device: desktop, 1440 x 900. User: workshop supervisor or service manager. Use the shared brief.

Goal: see every job in the workshop and where it is stuck.

Layout:
- Page title "Workshop board".
- Filters: Branch "Isolo", Service advisor, Technician, Date "Today". A segmented toggle "Board" (selected) or "Table".
- A row of 5 small figures with labels:
  - In workshop 18
  - Awaiting approval 4
  - Waiting parts 3
  - Ready for collection 5
  - Overdue 2 (red)
- Kanban columns: Check-in, Diagnosis, Warranty check, Awaiting approval, In repair, Waiting parts, Quality check, Ready, each with a count.
- Each card shows:
  - plate in bold and model;
  - customer name;
  - an initials avatar and "With: Musa A.";
  - time in stage ("2 h 10 min"), amber when over target and red when far over;
  - promised time;
  - small tags where relevant: purple "Warranty", gray "Repeat visit".
- Show 2 to 4 cards per column, all with plausible fictional plates.
- Cards have no shadows, just borders.
```

## Prompt 17: Technician home on a phone

```
Screen 17 of 19. Device: phone, 390 x 844. User: technician Musa Abdullahi. Use the shared brief.

Goal: open the app and know immediately what to work on.

Layout:
- Header "My jobs" with the date "Wed 27 Nov".
- Tabs: Today (selected, 3), Waiting parts (1), Done (2).
- Large job cards, each with:
  - plate and model;
  - bay;
  - stage badge;
  - the next action as a full-width button inside the card ("Continue repair", "Start diagnosis", "Collect parts");
  - promised time.
- The first card is KJA 482 TX. One card has a red "Returned from quality check" badge.
- No prices anywhere.
- Bottom navigation with 4 icons and labels: My jobs, Scan, Notifications, Profile.
```

## Prompt 18: Printed job card and gate pass

```
Screen 18 of 19. Format: A4 print layout, black and white friendly, shown as two A4 pages side by side plus a small A6 gate pass.

Page 1, front: a clean modern version of the paper form.
- Header: Dana Motors Ltd logo area top left, a brand logo placeholder top right, company address line, title "Job card", and a box "Warranty / Non-warranty" with Warranty ticked.
- Grid sections with thin rules:
  - Customer name and address.
  - Vehicle: model, registration, VIN, engine number, sold by, sold on.
  - Job number, service advisor, km, date.
  - Customer requests.
  - Instructions to technician.
  - Body and paint damage: car outline with C, D, S marks.
  - Fuel level.
  - Checklist: the 25 items with small square boxes.
  - Cause and nature of defect.
  - Estimated and actual table: delivery date, delivery time, amount parts, amount oil, amount labour, service charges, total, with ₦ amounts right-aligned.
  - Signature boxes, each with a printed name and date line: service advisor, technician, service manager, customer authorisation (with the authorisation sentence), customer delivery (with the delivery sentence).
  - Vehicle history: last visit and second last visit.

Page 2, back: "Terms and conditions", 12 numbered clauses in readable 10pt type.

Gate pass, A6: job number, gate pass number GP-2026-001234, plate, model, customer, delivered by, date and time, and a security signature line.

Use only black, grays and the navy accent. No app navigation or buttons.
```

## Prompt 19: Loading, error, waiting and cancelled states

```
Screen 19 of 19. Device: desktop, 1440 x 900, as a 2 x 2 grid of four smaller frames. Use the shared brief.

1. Loading: the job page with skeleton blocks matching the header, stepper and stage cards (pale gray shapes, no spinners).
2. Error:
   - A card in the middle: "Could not load job 2026000127. Check your connection and try again."
   - A "Try again" button with a refresh icon.
   - A muted line "If this keeps happening, contact your system administrator."
3. Waiting for someone else:
   - The Repair stage viewed by the cashier, read-only.
   - Banner "Waiting for Musa Abdullahi (Technician). You can view this step but only the technician can update it."
   - No primary button.
4. Cancelled job:
   - Header badge red "Cancelled". Stepper grayed out.
   - Panel "Cancelled by Funmi Oladele, 25 Nov 2026, 11:00. Reason: Customer took the vehicle to another workshop."
   - Link "View activity".
```

---

## After the designs

Build order once the designs are agreed, one slice at a time. Each slice follows AGENTS.md (pure logic with tests first, then UI, then visual check):

1. Job shell: header, stepper, collapsed summaries, action bar, Job file drawer. Replaces the current long page and keeps the existing data.
2. Check-in stages, including the walk-around (new data: fuel, checklist, damage marks, photos).
3. Diagnosis with supervisor allocation and engineer confirmation.
4. Warranty check with the service history rule (new settings and pure function in `server/src/modules/warranty/warranty.logic.ts`).
5. Estimate, item approval, phone approval, advance and release.
6. Repair technician view and supplementary estimate.
7. Quality check, billing and delivery.
8. Workshop board, technician home and the printed job card.

Each slice has open points to settle when it starts:
- The new stages need a stage field alongside the existing job status, so reports and integrations keep working. `TODO(confirm)` during slice 1 planning.
- The supervisor, service engineer and cashier handoffs need role checks added to `JOB_TRANSITION_ROLES` and the seed's `ROLE_PERMISSIONS`.
