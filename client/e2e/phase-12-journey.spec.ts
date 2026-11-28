import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";
import type { Role } from "./support/accounts";

/**
 * Phase 12: one new job through all 8 steps, every role, following
 * doc/testing/jobcard-revamp/phase-12-manual-test.md. The demo booking LSR-549ST (Adaeze Okafor,
 * a Sportage under warranty) becomes the job. At each step the owner's screen is checked and
 * photographed at 1440, 1024 and 390 px. Runs in order on a fresh copy of the demo data.
 */
test.describe.configure({ mode: "serial" });

const PLATE = "LSR-549ST";
const OWNER = "Adaeze Okafor";
const DESKTOP = { width: 1440, height: 900 };
const SIZES = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "390", width: 390, height: 844 },
] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`${name}, `) });
const card = (page: Page, title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const listItem = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

let jobId = "";

/** Opens the job and waits for the step heading; the dev server can answer 404 once while it compiles. */
async function open(page: Page, heading: string) {
  await page.goto(`/job-cards/${jobId}`);
  const step = page.getByRole("heading", { name: heading });
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(step.or(notFound)).toBeVisible({ timeout: 45_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(step).toBeVisible({ timeout: 45_000 });
}

/** The step owner's screen at desktop, tablet and phone width: no sideways scrolling, no forbidden text, a screenshot each. */
async function atEverySize(page: Page, heading: string, name: string) {
  // A toast laid out at one width keeps that width while the window is resized, which a real
  // device never does; let it close first. Toasts shown at phone width are checked in step 6.
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  for (const size of SIZES) {
    await page.setViewportSize(size);
    // The menu slides away when the window narrows; measure and photograph the settled screen.
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page, `${name} at ${size.name} px`);
    await expectCleanText(page, `${name} at ${size.name} px`);
    await shot(page, `p12-${name}-${size.name}`);
  }
  await page.setViewportSize(DESKTOP);
}

async function as(browser: Browser, role: Role, heading: string) {
  const page = await pageAs(browser, role, DESKTOP);
  await open(page, heading);
  return page;
}

async function draw(page: Page, label: string) {
  const pad = page.getByLabel(label);
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 30 + step * 20, box.y + box.height / 2 + (step % 2 ? 12 : -12));
  await page.mouse.up();
}

/** Whether the role has a matching notice; the outbox sends notices a moment after the step changes, so ask a few times. */
async function notified(request: Parameters<typeof apiAs>[0], role: Role, match: (row: { title: string; message: string }) => boolean) {
  const api = await apiAs(request, role);
  let seen = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const notes = await api.get<{ notifications?: { title: string; message: string }[] } | undefined>("/notifications?limit=30");
    if (notes?.notifications?.some(match)) return true;
    seen = JSON.stringify(notes?.notifications?.slice(0, 4).map((row) => `${row.title}: ${row.message}`) ?? notes ?? null).slice(0, 600);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }
  test.info().annotations.push({ type: `no matching notice for ${role}`, description: seen });
  return false;
}

async function pick(page: Page, finding: "first" | "last", button: "Add work" | "Add part", search: string, choose: RegExp) {
  await page.getByRole("button", { name: button })[finding]().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill(search);
  await dialog.getByRole("button", { name: choose }).first().click();
  await expect(dialog).toBeHidden();
}

test("1. Booking: the advisor converts the booking into a new job card", async ({ browser, request }) => {
  const page = await pageAs(browser, "advisor", DESKTOP);
  const api = await apiAs(request, "advisor");
  const list = await api.get<{ appointments: { id: string; vehicle?: { registrationNumber?: string } }[] }>("/service/appointments?limit=50");
  const booking = list.appointments.find((row) => row.vehicle?.registrationNumber === PLATE);
  expect(booking, `demo booking for ${PLATE}`).toBeTruthy();
  await page.goto(`/appointments/${booking!.id}`);
  await page.getByRole("button", { name: "Convert to job card" }).click();
  const consent = page.getByRole("dialog");
  await consent.getByRole("region", { name: "Job card opening terms and conditions" }).hover();
  await page.mouse.wheel(0, 5000);
  await consent.getByRole("checkbox").check();
  await consent.getByRole("button", { name: "Continue to job card" }).click();
  const form = page.getByRole("dialog", { name: "Open job card" });
  await form.getByLabel("Mileage").fill("18900");
  const ack = form.getByRole("checkbox", { name: /acknowledge|informed/i });
  if (await ack.count()) await ack.first().check();
  const target = new Date(Date.now() + 2 * 86_400_000);
  await page.getByRole("button", { name: "Choose promised date" }).first().click();
  const calendar = page.getByRole("region", { name: "Promised date calendar" });
  const day = calendar.getByRole("button", { name: new RegExp(`${MONTHS[target.getMonth()]} ${target.getDate()}(st|nd|rd|th)`) });
  if (!(await day.isVisible())) await calendar.getByRole("button", { name: /next month/i }).click();
  await day.click();
  await page.getByRole("button", { name: "Choose promised time" }).first().click();
  const picker = page.getByRole("region", { name: "Promised time picker" });
  await picker.getByRole("group", { name: "Hour" }).getByRole("button", { name: "04", exact: true }).click();
  await picker.getByRole("group", { name: "Minute" }).getByRole("button", { name: "00", exact: true }).click();
  await picker.getByRole("group", { name: "AM or PM" }).getByRole("button", { name: "PM" }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  await form.getByRole("combobox", { name: /Received by/ }).click();
  await page.getByRole("option", { name: /Chidi Eze/ }).first().click();
  await form.getByRole("button", { name: "Open job card" }).click();
  await expect(page.getByText(/^Job card \d+ opened\. Continue with check-in\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 1 of 8: Check-in" })).toBeVisible();
  jobId = await jobIdByPlate(request, PLATE);
  await page.context().close();
});

test("2. Check-in: details, walk-around and the customer's consent, then to the workshop supervisor", async ({ browser, request }) => {
  const page = await as(browser, "advisor", "Step 1 of 8: Check-in");
  await expect(page.getByText(/^With: Chidi Eze \(Service advisor\) since /)).toBeVisible();
  await atEverySize(page, "Step 1 of 8: Check-in", "1-check-in");
  await tab(page, "Details").click();
  await page.getByLabel("Instructions", { exact: true }).fill("Check the engine misfire the customer mentioned on the phone.");
  await bar(page).getByRole("button", { name: "Continue to walk-around" }).click();
  await expect(page.getByText("Details saved")).toBeVisible();
  await page.getByRole("radio", { name: "Half" }).check({ force: true });
  await page.getByRole("button", { name: "Mark the rest present" }).click();
  await expect(page.getByText(/^All 25 items checked/)).toBeVisible();
  await expect(bar(page).getByText(/^Saved \d\d:\d\d$/)).toBeVisible({ timeout: 15_000 });
  await tab(page, "Customer consent").click();
  await page.getByText("Owner", { exact: true }).click();
  await expect(page.getByText("Signing as")).toContainText(OWNER);
  await page.getByLabel("I have read and accept the terms and conditions.").check();
  await draw(page, "Customer signature. Sign with a finger or stylus.");
  await page.getByRole("button", { name: "Sign and accept" }).click();
  await expect(page.getByText(/Customer consent signed for job \d+/).first()).toBeVisible();
  await bar(page).getByRole("button", { name: "Send to workshop supervisor" }).click();
  await expect(page.getByText(/^Job \d+ sent to workshop supervisor$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 2 of 8: Diagnosis" })).toBeVisible();
  expect(await notified(request, "workshopManager", (row) => row.title === "Job sent to you" && row.message.includes(PLATE))).toBe(true);
  await page.context().close();
});

test("3. Diagnosis: assign, the technician's findings on a phone, the engineer confirms", async ({ browser, request }) => {
  const supervisor = await as(browser, "workshopManager", "Step 2 of 8: Diagnosis");
  await expect(supervisor.getByText(/^With: Workshop supervisor since /)).toBeVisible();
  await atEverySize(supervisor, "Step 2 of 8: Diagnosis", "2-diagnosis-assign");
  await supervisor.getByRole("radiogroup", { name: /Technician/ }).getByText("Tunde Akinyemi").click();
  const bay = supervisor.getByLabel(/^Bay/);
  const free = (await bay.locator("option").allInnerTexts()).find((label) => / \(free\)$/.test(label));
  if (free) await bay.selectOption({ label: free });
  await bar(supervisor).getByRole("button", { name: "Assign and send to Tunde Akinyemi" }).click();
  await expect(supervisor.getByText(/With: Tunde Akinyemi \(Technician\)/)).toBeVisible();
  await supervisor.context().close();
  expect(await notified(request, "technician", (row) => row.message.includes(PLATE))).toBe(true);

  const technician = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(technician, "Step 2 of 8: Diagnosis");
  // One customer request is open at a time; findings the customer did not mention sit below them.
  const findings = technician.getByLabel(/What did you find\?/);
  await findings.first().fill("Periodic service due. Engine misfire on cylinder 2, ignition coil weak.");
  await pick(technician, "first", "Add work", "ignition", /Replace ignition coil/);
  await expect(technician.getByText(/^Saved \d{2}:\d{2}$/).first()).toBeVisible();
  await technician.getByRole("button", { name: /^Engine shakes when cold in the morning/ }).click();
  await findings.first().fill("Misfire confirmed on a cold start. Same cause as the weak ignition coil.");
  await expect(technician.getByText(/^Saved \d{2}:\d{2}$/).first()).toBeVisible();
  await technician.getByRole("button", { name: "Add a finding the customer did not mention" }).click();
  await findings.last().fill("Front brake pads worn to 3 mm.");
  await pick(technician, "last", "Add work", "brake", /Replace front brake pads/);
  await expect(technician.getByText(/^Saved \d{2}:\d{2}$/).last()).toBeVisible();
  await atEverySize(technician, "Step 2 of 8: Diagnosis", "2-diagnosis-findings");
  await bar(technician).getByRole("button", { name: "Send to service engineer" }).click();
  await expect(technician.getByText(/With: Service engineer since/)).toBeVisible();
  await technician.context().close();

  const engineer = await as(browser, "engineer", "Step 2 of 8: Diagnosis");
  await atEverySize(engineer, "Step 2 of 8: Diagnosis", "2-diagnosis-engineer");
  await bar(engineer).getByRole("button", { name: "Confirm and send to warranty officer" }).click();
  await expect(engineer.getByRole("heading", { name: "Step 3 of 8: Warranty" })).toBeVisible();
  await engineer.context().close();
});

test("4. Warranty check: the officer decides who pays and returns the job to the advisor", async ({ browser, request }) => {
  const page = await as(browser, "warranty", "Step 3 of 8: Warranty");
  await atEverySize(page, "Step 3 of 8: Warranty", "3-warranty");
  for (const group of await page.getByRole("radiogroup", { name: /^Who pays for / }).all())
    await group.getByRole("radio", { name: "Customer pay", exact: true }).click();
  const reason = page.getByRole("region", { name: "Items to decide" }).getByLabel("Reason");
  if (await reason.count()) {
    await reason.fill("Customer pays for all items on this visit");
    await expect(page.getByText("Reason saved")).toBeVisible();
  }
  await bar(page).getByRole("button", { name: "Return to service advisor" }).click();
  await expect(page.getByRole("heading", { name: "Step 4 of 8: Estimate" })).toBeVisible();
  await expect(page.getByText(/^With: Chidi Eze/)).toBeVisible();
  expect(await notified(request, "advisor", (row) => row.title === "Job sent to you" && row.message.includes("Estimate"))).toBe(true);
  await page.context().close();
});

test("5. Estimate: prepared, the customer declines one item and signs, the advance is paid, the job is released", async ({ browser }) => {
  const page = await as(browser, "advisor", "Step 4 of 8: Estimate");
  await bar(page).getByRole("button", { name: "Prepare estimate" }).click();
  await expect(page.getByText(/^Estimate prepared for job \d+$/)).toBeVisible();
  await atEverySize(page, "Step 4 of 8: Estimate", "4-estimate-draft");
  await bar(page).getByRole("button", { name: "Present to customer" }).click();
  await expect(page.getByRole("heading", { name: `Your estimate for ${PLATE}` })).toBeVisible();
  const brakes = page.getByRole("group", { name: "Replace front brake pads: approve or decline" });
  await brakes.getByRole("button", { name: "Decline" }).click();
  await expect(brakes.getByRole("button", { name: "Decline" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("region", { name: "Who is signing" }).getByText("Owner", { exact: true }).click();
  await page.getByText("I approve the work above at the prices shown").click();
  await draw(page, "Customer signature. Sign with a finger or stylus.");
  await atEverySize(page, "Step 4 of 8: Estimate", "4-estimate-approval");
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText(/^Estimate approved and signed for job \d+$/)).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Release to workshop" })).toBeDisabled();
  await page.context().close();

  const cashier = await as(browser, "cashier", "Step 4 of 8: Estimate");
  await cashier.getByRole("button", { name: "Receive advance" }).click();
  const dialog = cashier.getByRole("dialog", { name: "Advance payment receipt" });
  await dialog.getByLabel("Amount received (NGN)").fill("20000");
  await dialog.getByLabel("Mode").selectOption("CASH");
  await dialog.getByRole("button", { name: "Save receipt" }).click();
  await expect(dialog.getByText(/^Advance received and reserved for job \d+\.$/)).toBeVisible();
  await cashier.context().close();

  const advisor = await as(browser, "advisor", "Step 4 of 8: Estimate");
  await expect(advisor.getByRole("region", { name: "Before work starts" }).getByText("Advance received: ₦20,000.00")).toBeVisible();
  await atEverySize(advisor, "Step 4 of 8: Estimate", "4-estimate-release");
  await bar(advisor).getByRole("button", { name: "Release to workshop" }).click();
  await expect(advisor.getByRole("heading", { name: "Step 5 of 8: Repair" })).toBeVisible({ timeout: 30_000 });
  await advisor.context().close();
});

test("6. Repair: the technician works on a phone and finds a part; the customer approves the supplementary estimate", async ({ browser, request }) => {
  const technician = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(technician, "Step 5 of 8: Repair");
  await expect(technician.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(listItem(technician, "Replace front brake pads")).toHaveCount(0);
  await atEverySize(technician, "Step 5 of 8: Repair", "5-repair-technician");
  await technician.setViewportSize({ width: 390, height: 844 });
  const ignition = listItem(technician, "Replace ignition coil and spark plugs");
  const start = ignition.getByRole("button", { name: "Start" });
  if (await start.count()) await start.click();
  await ignition.getByRole("button", { name: "Done" }).click();
  await expect(technician.getByText("Replace ignition coil and spark plugs marked done")).toBeVisible();
  // A toast shown at phone width fits the screen.
  await expectNoHorizontalOverflow(technician, "repair with a toast at 390 px");
  await technician.getByRole("button", { name: "Need a part" }).click();
  const sheet = technician.getByRole("dialog", { name: "Need a part" });
  await sheet.getByLabel("Why is the part needed?").fill("Rear wiper blade torn, smears the screen.");
  await sheet.getByRole("button", { name: "Choose a part" }).click();
  const parts = technician.getByRole("dialog", { name: "Add a part needed" });
  await parts.getByRole("searchbox").or(parts.getByRole("textbox")).first().fill("wiper");
  await parts.getByRole("button", { name: /Rear wiper blade/ }).first().click();
  await technician.getByRole("dialog", { name: "Need a part" }).getByLabel("Quantity").fill("1");
  await technician.getByRole("dialog", { name: "Need a part" }).getByRole("button", { name: "Send to service advisor" }).click();
  await expect(technician.getByText(/^Sent to .+ for a supplementary estimate$/)).toBeVisible();
  await expect(bar(technician).getByRole("button", { name: "Send for quality check" })).toBeDisabled();
  await technician.context().close();
  expect(await notified(request, "advisor", (row) => row.title === "New finding during repair" && row.message.includes("Rear wiper blade torn"))).toBe(true);

  const advisor = await as(browser, "advisor", "Step 5 of 8: Repair");
  await atEverySize(advisor, "Step 5 of 8: Repair", "5-repair-advisor");
  await advisor.getByRole("status").filter({ hasText: "New finding from" }).getByRole("button", { name: "Prepare supplementary estimate" }).click();
  await expect(advisor.getByText(/^Supplementary estimate, revision 2, prepared for job \d+$/)).toBeVisible();
  await bar(advisor).getByRole("button", { name: "Present to customer" }).click();
  await expect(advisor.getByRole("heading", { name: new RegExp(`Extra work found on ${PLATE}`) })).toBeVisible();
  await advisor.getByText("I approve the work above at the prices shown").click();
  await draw(advisor, "Customer signature. Sign with a finger or stylus.");
  await advisor.getByRole("button", { name: "Approve and sign" }).click();
  await expect(advisor.getByText(/^Estimate approved and signed for job \d+$/)).toBeVisible();
  await advisor.context().close();

  const back = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(back, "Step 5 of 8: Repair");
  for (const item of await back.getByRole("listitem").filter({ has: back.getByRole("button", { name: /^(Start|Done)$/ }) }).all()) {
    const begin = item.getByRole("button", { name: "Start" });
    if (await begin.count()) await begin.click();
    await item.getByRole("button", { name: "Done" }).click();
  }
  const send = bar(back).getByRole("button", { name: "Send for quality check" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(back.getByRole("heading", { name: "Step 6 of 8: Quality check" })).toBeVisible({ timeout: 30_000 });
  await back.context().close();
});

test("7. Quality check: fails once and goes back, then passes with the road test and signature", async ({ browser, request }) => {
  const supervisor = await as(browser, "workshopManager", "Step 6 of 8: Quality check");
  await atEverySize(supervisor, "Step 6 of 8: Quality check", "6-quality-check");
  const ignition = supervisor.getByRole("listitem").filter({ has: supervisor.getByText("Replace ignition coil and spark plugs", { exact: true }) });
  await ignition.getByRole("button", { name: "Fail" }).click();
  await bar(supervisor).getByRole("button", { name: "Fail and return to technician" }).click();
  const dialog = supervisor.getByRole("dialog", { name: "Fail and return to technician" });
  await dialog.getByLabel("What must the technician fix").fill("Misfire still present at idle. Recheck the coil connector.");
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(supervisor.getByRole("heading", { name: "Step 5 of 8: Repair" })).toBeVisible({ timeout: 30_000 });
  await supervisor.context().close();
  expect(await notified(request, "technician", (row) => row.title.includes("QC failed"))).toBe(true);

  const technician = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(technician, "Step 5 of 8: Repair");
  await expect(technician.getByRole("status").filter({ hasText: "Returned from quality check" })).toContainText("Misfire still present at idle.");
  const redo = listItem(technician, "Replace ignition coil and spark plugs");
  await redo.getByRole("button", { name: "Start" }).click();
  await redo.getByRole("button", { name: "Done" }).click();
  await bar(technician).getByRole("button", { name: "Send for quality check" }).click();
  await expect(technician.getByRole("heading", { name: "Step 6 of 8: Quality check" })).toBeVisible({ timeout: 30_000 });
  await technician.context().close();

  const again = await as(browser, "workshopManager", "Step 6 of 8: Quality check");
  for (const row of await again.getByRole("group", { name: /: pass or fail$/ }).all()) await row.getByRole("button", { name: "Pass" }).click();
  // Ticked with the keyboard: at this size the fixed action bar covers the lower checks.
  for (const label of ["No warning lights on dashboard", "Fluid levels correct", "Wheel nuts torqued", "Vehicle interior clean"]) {
    const box = again.getByLabel(label);
    await box.focus();
    await again.keyboard.press("Space");
    await expect(box).toBeChecked();
  }
  const startKm = Number(await again.getByLabel("Start km").inputValue());
  await again.getByLabel("End km").fill(String(startKm + 8));
  await draw(again, "Sign to certify the vehicle as roadworthy");
  await bar(again).getByRole("button", { name: "Pass quality check" }).click();
  await expect(again.getByRole("heading", { name: "Step 7 of 8: Billing" })).toBeVisible({ timeout: 30_000 });
  await again.context().close();
});

test("8. Billing: ready and notify, invoice, payment, then to delivery", async ({ browser }) => {
  const advisor = await as(browser, "advisor", "Step 7 of 8: Billing");
  await atEverySize(advisor, "Step 7 of 8: Billing", "7-billing-ready");
  await bar(advisor).getByRole("button", { name: "Mark ready and notify customer" }).click();
  const ready = advisor.getByRole("dialog", { name: "Mark ready and notify customer" });
  await ready.getByLabel("Phone call").check();
  await ready.getByRole("button", { name: "Mark ready and save notice" }).click();
  await expect(advisor.getByText(/marked ready\. The customer notice is recorded\./)).toBeVisible();
  await advisor.context().close();

  const cashier = await as(browser, "cashier", "Step 7 of 8: Billing");
  await card(cashier, "Invoice").getByRole("button", { name: "Create invoice" }).click();
  const create = cashier.getByRole("dialog", { name: "Create invoice" });
  await create.getByRole("button", { name: "Create invoice" }).click();
  await expect(cashier.getByText(/^Invoice \d+ created\.$/)).toBeVisible();
  await atEverySize(cashier, "Step 7 of 8: Billing", "7-billing-invoice");
  await card(cashier, "Invoice").getByRole("button", { name: "Record payment" }).click();
  const receipt = cashier.getByRole("dialog", { name: "Payment receipt" });
  await receipt.getByLabel("Mode").selectOption("CASH");
  await receipt.getByRole("button", { name: "Save receipt" }).click();
  await expect(cashier.getByText("Payment receipt created")).toBeVisible();
  await expect(card(cashier, "Invoice").getByText("Paid", { exact: true })).toBeVisible();
  await cashier.context().close();

  const back = await as(browser, "advisor", "Step 7 of 8: Billing");
  await bar(back).getByRole("button", { name: "Send to delivery" }).click();
  await expect(back.getByRole("heading", { name: "Step 8 of 8: Delivery" })).toBeVisible({ timeout: 30_000 });
  await back.context().close();
});

test("9. Delivery: the owner collects, signs, and the gate pass prints; the job is closed with its full activity", async ({ browser }) => {
  const page = await pageAs(browser, "advisor", DESKTOP);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await open(page, "Step 8 of 8: Delivery");
  await expect(card(page, "Declined, recommended for next visit").getByText("Replace front brake pads")).toBeVisible();
  await atEverySize(page, "Step 8 of 8: Delivery", "8-delivery");
  const belongings = card(page, "Your belongings").getByRole("button", { name: "Tick all returned" });
  if (await belongings.count()) await belongings.click();
  await page.getByLabel(`${OWNER} (owner)`).check();
  await draw(page, "Customer signs to take delivery of the vehicle");
  await bar(page).getByRole("button", { name: "Complete delivery and print gate pass" }).click();
  await expect(page.getByText(/^Job \d+ delivered\. Gate pass \d+ issued\.$/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/job-cards/${jobId}/gate-pass/print\\?print=1$`), { timeout: 30_000 });
  await shot(page, "p12-9-gate-pass");
  await page.getByRole("link", { name: "Back to job card" }).click();
  await expect(page.getByRole("heading", { name: "Closed job" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(`^Delivered to ${OWNER}, \\d{1,2} \\w{3} 2026, \\d{2}:\\d{2}$`))).toBeVisible();
  for (const size of SIZES) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
    await expectNoHorizontalOverflow(page, `closed job at ${size.name} px`);
    await expectCleanText(page, `closed job at ${size.name} px`);
    await shot(page, `p12-9-closed-${size.name}`);
  }
  await page.setViewportSize(DESKTOP);
  await page.getByRole("button", { name: "Job file" }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  const drawer = page.getByRole("dialog");
  for (const line of ["Quality check failed. Returned to Repair", "Quality check passed. Moved to Billing", "Moved from Billing to Delivery"])
    await expect(drawer.getByText(line).first()).toBeVisible();
  await expectCleanText(page, "Activity of the finished job", drawer);
  await shot(page, "p12-9-activity");
  await page.context().close();
});
