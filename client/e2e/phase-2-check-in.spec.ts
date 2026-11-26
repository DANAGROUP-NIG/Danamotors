import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/accounts";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 2: check-in (Details, Walk-around, Customer consent) and the handoff, following
 * doc/testing/jobcard-revamp/phase-2-manual-test.md. Runs in order on a fresh copy of the demo data.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("advisor") });

const TERMS = Array.from({ length: 12 }, (_, index) =>
  index === 2
    ? "The customer will collect the vehicle within 48 hours of being told it is ready. After that, storage is charged at ₦2,000.00 per day."
    : `Test term ${index + 1} for the job card.`,
);

/** A small solid PNG, for photo uploads. */
function png(width = 64, height = 48): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  // Each row starts with filter type 0, then grey pixels.
  const rows = Buffer.alloc(height * (1 + width * 3), 0x80);
  for (let row = 0; row < height; row++) rows[row * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Picks a date a number of days ahead in the promised date calendar. */
async function pickDate(page: Page, daysAhead: number) {
  const target = new Date(Date.now() + daysAhead * 86_400_000);
  await page.getByRole("button", { name: "Choose promised date" }).first().click();
  const calendar = page.getByRole("region", { name: "Promised date calendar" });
  const day = calendar.getByRole("button", { name: new RegExp(`${MONTHS[target.getMonth()]} ${target.getDate()}(st|nd|rd|th)`) });
  if (!(await day.isVisible())) await calendar.getByRole("button", { name: /next month/i }).click();
  await day.click();
}

/** Picks hour, minute and AM or PM in the promised time picker. */
async function pickTime(page: Page, hour: string, minute: string, period: "AM" | "PM") {
  await page.getByRole("button", { name: "Choose promised time" }).first().click();
  const picker = page.getByRole("region", { name: "Promised time picker" });
  await picker.getByRole("group", { name: "Hour" }).getByRole("button", { name: hour, exact: true }).click();
  await picker.getByRole("group", { name: "Minute" }).getByRole("button", { name: minute, exact: true }).click();
  await picker.getByRole("group", { name: "AM or PM" }).getByRole("button", { name: period }).click();
  await picker.getByRole("button", { name: "Done" }).click();
}

/** Draws a short line in the signature box. */
async function sign(page: Page) {
  const pad = page.getByLabel("Customer signature. Sign with a finger or stylus.");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 40 + step * 25, box.y + box.height / 2 + (step % 2 ? 15 : -15));
  await page.mouse.up();
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`${name}, `) });
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });

test("settings: the administrator enters the job card terms", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/settings/document-terms");
  await page.getByLabel("Document").selectOption({ label: "Job card" });
  const terms = page.getByLabel("Terms (one per line, printed in this order; up to 20)");
  await expect(terms).toBeEnabled();
  await terms.fill(TERMS.join("\n"));
  await page.getByRole("button", { name: "Save terms" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.context().close();
});

test("A: a booking opens as a job card with no bay, technician or prices, and lands on Check-in", async ({ page, request }) => {
  const api = await apiAs(request, "advisor");
  const list = await api.get<{ appointments: { id: string; vehicle?: { registrationNumber?: string } }[] }>("/service/appointments?limit=50");
  const booking = list.appointments.find((row) => row.vehicle?.registrationNumber === "KJA-523ST");
  expect(booking, "demo booking for KJA-523ST").toBeTruthy();
  await page.goto(`/appointments/${booking!.id}`);
  await page.getByRole("button", { name: "Convert to job card" }).click();
  const consent = page.getByRole("dialog");
  await expect(consent.getByText("Scroll to the bottom of the terms to show the consent checkbox.")).toBeVisible();
  const terms = consent.getByRole("region", { name: "Job card opening terms and conditions" });
  await terms.hover();
  await page.mouse.wheel(0, 5000);
  await consent.getByRole("checkbox").check();
  await consent.getByRole("button", { name: "Continue to job card" }).click();
  const form = page.getByRole("dialog", { name: "Open job card" });
  await expect(form.getByText("Job number assigned on save")).toBeVisible();
  for (const gone of ["Bay", "Technician", "Engineer (optional)", "Service charge"]) await expect(form.getByText(gone, { exact: true })).toHaveCount(0);
  await expect(form.getByText("₦")).toHaveCount(0);
  await expect(form.locator("input[aria-label='Request 1 description']")).toHaveValue("Periodic service (20,000 km)");
  await expect(form.getByText("Last recorded 16,050 km. The reading cannot go lower unless the odometer was replaced.")).toBeVisible();
  await form.getByLabel("Mileage").fill("21400");
  const ack = form.getByRole("checkbox", { name: /acknowledge|informed/i });
  if (await ack.count()) await ack.first().check();
  await pickDate(page, 2);
  await pickTime(page, "04", "00", "PM");
  await form.getByRole("combobox", { name: /Received by/ }).click();
  await page.getByRole("option", { name: /Chidi Eze/ }).first().click();
  await expectCleanText(page, "opening form", form);
  await form.getByRole("button", { name: "Open job card" }).click();
  await expect(page.getByText(/^Job card \d+ opened\. Continue with check-in\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 1 of 8: Check-in" })).toBeVisible();
  await expect(page.getByText("Walking round the vehicle")).toBeVisible();
  await expect(tab(page, "Walk-around")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/^With: Chidi Eze \(Service advisor\) since /)).toBeVisible();
});

test("B: Details shows the notes, names each mistake beside its field, and saves", async ({ page, request }) => {
  await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-482TX")}`);
  await tab(page, "Details").click();
  await expect(page.getByText(/^Not a repeat visit\./)).toBeVisible();
  // Phase 4: the vehicle has had no periodic service since its sale, so the alert gives the verdict.
  await expect(page.getByText("Service history has 3 missed services in warranty year 1. Warranty items will need the warranty officer's review.")).toBeVisible();
  await expect(page.getByText("Last recorded 43,100 km")).toBeVisible();
  await expect(page.getByText("₦")).toHaveCount(0);
  const mileage = page.getByLabel("Mileage");
  const next = bar(page).getByRole("button", { name: "Continue to walk-around" });

  await mileage.fill("");
  await next.click();
  await expect(page.getByText("Enter the current mileage")).toBeVisible();
  await mileage.fill("40000");
  await next.click();
  await expect(page.getByText("Mileage cannot be lower than the last recorded 43,100 km. Check the reading, or tick Odometer replaced and give a reason.")).toBeVisible();
  await page.getByLabel("Odometer replaced (the reading can go below the last one)").check();
  await next.click();
  await expect(page.getByText("Give a reason for the odometer replacement")).toBeVisible();
  await page.getByLabel("Odometer replaced (the reading can go below the last one)").uncheck();
  await mileage.fill("48250");
  await page.getByRole("button", { name: /Delete request 1/ }).click();
  await page.getByRole("button", { name: /Delete request 1/ }).click();
  await page.getByRole("button", { name: /Delete request 1/ }).click();
  await next.click();
  await expect(page.getByText("Add at least one customer request")).toBeVisible();
  await page.getByRole("button", { name: "Add request" }).click();
  await page.getByLabel("Request 1 description").fill("Noise from front left wheel when braking");
  await page.getByLabel("Instructions", { exact: true }).fill("Confirm front left braking noise and check the AC cooling.");
  await expectCleanText(page, "Details with errors");

  await bar(page).getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.reload();
  await tab(page, "Details").click();
  await expect(page.getByLabel("Mileage")).toHaveValue("48250");
  await expect(page.getByLabel("Instructions", { exact: true })).toHaveValue("Confirm front left braking noise and check the AC cooling.");
  await bar(page).getByRole("button", { name: "Continue to walk-around" }).click();
  await expect(page.getByText("Details saved")).toBeVisible();
  await expect(tab(page, "Walk-around")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Details")).toHaveAttribute("aria-label", "Step 1 of 3: Details, complete");
  await shot(page, "phase2-details-1440");
});

test("C: Walk-around records fuel, damage, checklist, service book, belongings and a photo, and keeps them", async ({ page, request }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-482TX")}`);
  await tab(page, "Walk-around").click();
  await page.getByRole("radio", { name: "Half" }).check({ force: true });
  await expect(bar(page).getByText(/^Saved \d\d:\d\d$/)).toBeVisible();

  // Damage: tap the rear bumper, try to save without a type, then a scratch.
  const diagram = page.getByRole("group", { name: /Car diagram, seen from above/ });
  const size = (await diagram.boundingBox())!;
  const at = (x: number, y: number) => diagram.click({ position: { x: size.width * x, y: size.height * y } });
  await at(0.5, 0.95);
  await expect(page.getByText("Position:")).toContainText("rear bumper");
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByText("Choose Crack, Dent or Scratch.")).toBeVisible();
  await page.getByText("Scratch", { exact: true }).last().click();
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByText("Scratch on rear bumper marked")).toBeVisible();
  // A dent on the front right door with a photo, removed and added again.
  await at(0.82, 0.42);
  await expect(page.getByText("Position:")).toContainText("front right door");
  await page.getByText("Dent", { exact: true }).last().click();
  await page.getByRole("region", { name: "Body and paint" }).locator("input[type=file]").setInputFiles({ name: "dent.png", mimeType: "image/png", buffer: png() });
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByText("Dent on front right door marked")).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo: Dent on front right door" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Dent on front right door" }).click();
  await page.getByRole("button", { name: "Remove mark" }).click();
  await expect(page.getByText("Dent on front right door removed")).toBeVisible();
  await at(0.82, 0.42);
  await page.getByText("Dent", { exact: true }).last().click();
  await page.getByRole("button", { name: "Save mark" }).click();
  await expect(page.getByRole("list", { name: "Damage marks" })).toContainText("Dent on front right door");

  // Checklist: tap to cycle, then mark the rest present.
  const hubCaps = page.getByRole("button", { name: /^Hub caps: / });
  await hubCaps.click();
  await expect(hubCaps).toHaveAccessibleName("Hub caps: Present");
  await hubCaps.click();
  await expect(hubCaps).toHaveAccessibleName("Hub caps: Missing");
  const ac = page.getByRole("button", { name: /^AC working: / });
  await ac.click();
  await ac.click();
  await ac.click();
  await expect(ac).toHaveAccessibleName("AC working: Not working");
  await page.getByRole("button", { name: "Mark the rest present" }).click();
  await expect(page.getByText("All 25 items checked: 1 missing, 1 not working.")).toBeVisible();

  await page.getByRole("switch", { name: "Service book seen" }).check();
  await page.getByLabel("Stamps for this warranty year").fill("3");
  await page.getByLabel("No valuables left in the vehicle").check();
  // The autosave sends the whole draft a moment after the last change.
  const saved = page.waitForResponse((response) => response.url().endsWith("/check-in/walk-around") && response.request().postData()?.includes("Umbrella in boot") === true);
  await page.getByLabel("Items left in the vehicle (optional)").fill("Umbrella in boot");
  expect((await saved).status()).toBe(200);
  await page.getByRole("region", { name: "Photos" }).locator("input[type=file]").first().setInputFiles({ name: "front.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("Front photo saved")).toBeVisible();
  await expect(page.getByRole("img", { name: "Front photo" })).toBeVisible();
  await expect(bar(page).getByText(/^Saved \d\d:\d\d$/)).toBeVisible({ timeout: 10_000 });
  await expectCleanText(page, "Walk-around");
  await expectNoHorizontalOverflow(page, "Walk-around at 1024");
  await shot(page, "phase2-walk-around-1024");

  await page.reload();
  await tab(page, "Walk-around").click();
  await expect(page.getByRole("radio", { name: "Half" })).toBeChecked();
  await expect(page.getByRole("button", { name: "Hub caps: Missing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AC working: Not working" })).toBeVisible();
  await expect(page.getByLabel("Stamps for this warranty year")).toHaveValue("3");
  await expect(page.getByLabel("Items left in the vehicle (optional)")).toHaveValue("Umbrella in boot");
  await expect(page.getByRole("list", { name: "Damage marks" })).toContainText("Scratch on rear bumper");
  await expect(page.getByRole("img", { name: "Front photo" })).toBeVisible();
});

test("D: the customer sees only customer information, every missing answer is named, and the signed copy holds the walk-around", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-482TX");
  await page.goto(`/job-cards/${id}`);
  await tab(page, "Customer consent").click();
  await expect(page.getByRole("heading", { name: "Please confirm your vehicle details" })).toBeVisible();
  for (const text of ["48,250 km", "Half (1/2)", "Scratch on rear bumper, dent on front right door", "Hub caps", "AC working", "Noise from front left wheel when braking"])
    await expect(page.getByRole("tabpanel")).toContainText(text);
  await expect(page.getByRole("tabpanel")).not.toContainText("Confirm front left braking noise");
  for (const term of TERMS) await expect(page.getByText(term, { exact: true })).toBeVisible();
  await expect(page.locator("ol.list-decimal > li")).toHaveCount(12);

  const submit = page.getByRole("button", { name: "Sign and accept" });
  await submit.click();
  await expect(page.getByText("Tick the box to accept the terms and conditions.")).toBeVisible();
  await expect(page.getByText("Ask the customer to sign in the box.")).toBeVisible();
  await page.getByText("Representative", { exact: true }).click();
  await page.getByLabel("I have read and accept the terms and conditions.").check();
  await sign(page);
  await submit.click();
  await expect(page.getByText("Enter the name of the person signing.")).toBeVisible();
  await expect(page.getByText("Enter the phone number of the person signing, for example 0803 555 0142.")).toBeVisible();
  await expect(page.getByText("Enter how the person is related to the customer, for example driver or spouse.")).toBeVisible();
  await page.getByText("Owner", { exact: true }).click();
  await expect(page.getByText("Signing as")).toContainText("Adaeze Okafor");
  await expectCleanText(page, "customer consent");
  await shot(page, "phase2-consent-1440");
  await submit.click();
  await expect(page.getByText(/Customer consent signed for job \d+/).first()).toBeVisible();
  await expect(page.getByText(/^Signed by Adaeze Okafor, \d{1,2} [A-Z][a-z]{2} \d{4}, \d\d:\d\d$/)).toBeVisible();
  await expect(page.getByText("Signed on screen")).toBeVisible();
  for (const name of ["Details", "Walk-around", "Customer consent"]) await expect(tab(page, name)).toHaveAttribute("aria-label", new RegExp(`${name}, complete$`));

  await page.getByRole("link", { name: "View signed copy" }).click();
  await expect(page.getByRole("heading", { name: "Signed job-opening approval" })).toBeVisible();
  for (const text of ["Vehicle condition at check-in", "Half (1/2)", "Seen, 3 stamps this warranty year", "Umbrella in boot", "Dent on front right door", "Scratch on rear bumper", "₦2,000.00", "Lagos time"])
    await expect(page.locator("article")).toContainText(text);
  await expectCleanText(page, "signed copy");
  await page.emulateMedia({ media: "print" });
  await shot(page, "phase2-signed-copy-print");
  await page.emulateMedia({ media: "screen" });
});

test("F: sending to the workshop supervisor moves the job to Diagnosis and tells the workshop manager", async ({ page, browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-482TX");
  await page.goto(`/job-cards/${id}`);
  await expect(bar(page).getByText("The workshop supervisor will assign a technician and bay.")).toBeVisible();
  await bar(page).getByRole("button", { name: "Send to workshop supervisor" }).click();
  await expect(page.getByText(/^Job \d+ sent to workshop supervisor$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 2 of 8: Diagnosis" })).toBeVisible();
  await expect(page.getByText(/^With: Workshop supervisor since /)).toBeVisible();
  await page.getByRole("button", { name: /^Check-in completed by Chidi Eze/ }).click();
  for (const text of ["Instructions to technician", "Half (1/2)", "1 missing, 1 not working", "Signed by the customer"]) await expect(page.locator("main")).toContainText(text);

  const manager = await apiAs(request, "workshopManager");
  const notes = await manager.get<{ notifications?: { title: string; message: string }[] } | { title: string; message: string }[]>("/notifications?limit=10");
  const list = Array.isArray(notes) ? notes : (notes.notifications ?? []);
  expect(list.some((note) => note.title === "Job sent to you" && note.message.includes("KJA-482TX") && note.message.includes("Step: Diagnosis"))).toBe(true);

  const wm = await pageAs(browser, "workshopManager");
  await wm.goto(`/job-cards/${id}`);
  await expect(wm.getByRole("heading", { name: "Step 2 of 8: Diagnosis" })).toBeVisible();
  await wm.context().close();
});

test("G: the hand-over is blocked with reasons, others see check-in read only", async ({ page, browser, request }) => {
  await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-523ST")}`);
  await tab(page, "Customer consent").click();
  await expect(page.getByText("The customer signs once Details and Walk-around are complete.")).toBeVisible();
  await expect(page.getByText("Record the fuel level on Walk-around.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to Walk-around" })).toBeVisible();
  const handoff = bar(page).getByRole("button", { name: "Send to workshop supervisor" });
  await expect(handoff).toBeDisabled();
  await expect(bar(page)).toContainText("Record the fuel level on Walk-around. Check every checklist item on Walk-around (25 not checked). Get the customer's signature on Customer consent.");

  const technician = await pageAs(browser, "technician");
  await technician.goto(`/job-cards/${await jobIdByPlate(request, "KJA-521ST")}`);
  await expect(technician.getByText("Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it.")).toBeVisible();
  await technician.getByRole("tab", { name: /Walk-around, / }).click();
  await expect(technician.getByRole("button", { name: "Hub caps: Missing" })).toBeDisabled();
  await expect(technician.getByRole("button", { name: "Mark the rest present" })).toHaveCount(0);
  await technician.getByRole("tab", { name: /Customer consent, / }).click();
  await expect(technician.getByText("The customer has not signed yet. The service advisor collects the signature.")).toBeVisible();
  await expect(technician.getByRole("button", { name: "Send to workshop supervisor" })).toHaveCount(0);
  await expectCleanText(technician, "technician check-in");
  await technician.context().close();
});

test("E: a failed signature keeps the input, a change after signing asks for a new one, and a failed autosave can be retried", async ({ page, context, request }) => {
  await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-521ST")}`);
  await expect(page.getByRole("heading", { name: "Please confirm your vehicle details" })).toBeVisible();
  await page.getByLabel("I have read and accept the terms and conditions.").check();
  await sign(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Sign and accept" }).click();
  await expect(page.locator("p[role=alert]").last()).toBeVisible();
  await expect(page.getByLabel("I have read and accept the terms and conditions.")).toBeChecked();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Sign and accept" }).click();
  await expect(page.getByText(/^Signed by Tobi Adeyemi, /)).toBeVisible();

  await tab(page, "Walk-around").click();
  await page.getByRole("radio", { name: "Full" }).check({ force: true });
  await expect(bar(page).getByText(/^Saved \d\d:\d\d$/)).toBeVisible();
  await tab(page, "Customer consent").click();
  await expect(page.getByText("The details changed after the customer signed. Ask the customer to check them and sign again.")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toContainText("Full");
  await expect(bar(page)).toContainText("Details changed after the customer signed. Ask the customer to sign again on Customer consent.");

  await tab(page, "Walk-around").click();
  await context.setOffline(true);
  await page.getByRole("radio", { name: "Three quarters" }).check({ force: true });
  await expect(bar(page).getByText(/^Not saved\./)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Three quarters" })).toBeChecked();
  await context.setOffline(false);
  await bar(page).getByRole("button", { name: "Retry" }).click();
  await expect(bar(page).getByText(/^Saved \d\d:\d\d$/)).toBeVisible();
});

test("H: at phone size check-in is one column with no sideways scrolling", async ({ browser, request }) => {
  const page = await pageAs(browser, "advisor", { width: 390, height: 844 });
  await page.goto(`/job-cards/${await jobIdByPlate(request, "LSR-522ST")}`);
  await expect(page.getByText("Step 1 of 8: Check-in").first()).toBeVisible();
  for (const name of ["Details", "Walk-around", "Customer consent"]) {
    await page.getByRole("tab", { name: new RegExp(`${name}, `) }).click();
    await page.waitForTimeout(300);
    await expectNoHorizontalOverflow(page, `${name} at 390`);
    await expectCleanText(page, `${name} at 390`);
    await shot(page, `phase2-${name.toLowerCase().replace(/ /g, "-")}-390`);
  }
  await page.getByRole("tab", { name: /Walk-around, / }).click();
  const fuel = await page.getByRole("heading", { name: "Fuel level" }).boundingBox();
  const body = await page.getByRole("heading", { name: "Body and paint" }).boundingBox();
  expect(Math.abs(fuel!.x - body!.x), "cards stack in one column").toBeLessThan(4);
  await page.context().close();
});

test("F2: the signed demo job hands over from the bar", async ({ page, request }) => {
  await page.goto(`/job-cards/${await jobIdByPlate(request, "LSR-522ST")}`);
  await expect(page.getByText(/^Signed by Lakeside Courier Services Ltd, /)).toBeVisible();
  await bar(page).getByRole("button", { name: "Send to workshop supervisor" }).click();
  await expect(page.getByRole("heading", { name: "Step 2 of 8: Diagnosis" })).toBeVisible();
});

test("I: check-in works with the keyboard alone", async ({ page, request }) => {
  await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-523ST")}`);
  await tab(page, "Details").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "Walk-around")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Walk-around")).toBeFocused();
  const hubCaps = page.getByRole("button", { name: /^Hub caps: / });
  await hubCaps.focus();
  await page.keyboard.press("m");
  await expect(hubCaps).toHaveAccessibleName("Hub caps: Missing");
  await page.keyboard.press("p");
  await expect(hubCaps).toHaveAccessibleName("Hub caps: Present");
  await page.keyboard.press("Enter");
  await expect(hubCaps).toHaveAccessibleName("Hub caps: Missing");
  await page.getByRole("button", { name: "Add a mark with the keyboard" }).press("Enter");
  await expect(page.getByText("Position:")).toContainText("roof");
  await page.getByRole("img", { name: "New damage mark. Use the arrow keys to move it." }).focus();
  for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
  await expect(page.getByText("Position:")).toContainText("left");
  await page.getByRole("radio", { name: "Crack" }).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Save mark" }).press("Enter");
  await expect(page.getByText(/^Crack on .* marked$/)).toBeVisible();
});
