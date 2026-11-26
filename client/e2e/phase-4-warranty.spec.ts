import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/accounts";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 4: the warranty check (coverage, service history rule, outside records, who pays), following
 * doc/testing/jobcard-revamp/phase-4-manual-test.md. Runs in order on a fresh copy of the demo data.
 *   KJA-527ST (JC-S16): one missed service in year 2, AC items to claim.
 *   KJA-528ST (JC-S17): regular history, in the open recall RC-DM-2601.
 *   KJA-529ST (JC-S18): no sale date recorded.
 *   LSR-515ST (JC-S05): at the estimate, warranty step skipped.   KJA-482TX (JC-S01): at check-in.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("warranty") });

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
  const rows = Buffer.alloc(height * (1 + width * 3), 0x80);
  for (let row = 0; row < height; row++) rows[row * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

/** A Lagos calendar day this many days ago, as the date field takes it. */
const lagosDaysAgo = (days: number) => new Date(Date.now() + 3_600_000 - days * 86_400_000).toISOString().slice(0, 10);

const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const payer = (page: Page, item: string) => page.getByRole("radiogroup", { name: `Who pays for ${item}` }).first();
const open = async (page: Page, id: string, heading = "Step 3 of 8: Warranty") => {
  await page.goto(`/job-cards/${id}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 30_000 });
};

test("A: the warranty officer sees coverage, service history, campaigns and the items, with the handoff blocked", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-527ST");
  await open(page, id);
  const coverage = page.getByRole("region", { name: "Coverage" });
  await expect(coverage.getByText("Active", { exact: true })).toBeVisible();
  await expect(coverage.getByText(/^Sold \d+ \w{3} \d{4}\. Expires \d+ \w{3} \d{4}\.$/)).toBeVisible();
  await expect(coverage.getByRole("progressbar", { name: /^Time used: 1 year \d+ months? of 5 years$/ })).toBeVisible();
  await expect(coverage.getByRole("progressbar", { name: "Distance: 27,300 of 100,000 km" })).toBeVisible();

  const history = page.getByRole("region", { name: "Service history" });
  await expect(history.getByText("1 missed service", { exact: true })).toBeVisible();
  await expect(history.getByText("Service at least every 3 months or 5,000 km, whichever comes first.")).toBeVisible();
  await expect(history.getByText("Service history has 1 missed service in warranty year 2.")).toBeVisible();
  await expect(history.getByRole("group", { name: /^Year 2, quarter 2: Missed\. 5 months( \d weeks?)? and 4,500 km since the last service$/ })).toBeVisible();
  await expect(history.getByRole("group", { name: /^Year 1, quarter 1: On time\./ })).toBeVisible();
  await expect(history.getByText("Year 2 (current)")).toBeVisible();

  await expect(page.getByRole("region", { name: "Campaigns and recalls" }).getByText("No open campaigns for this vehicle.")).toBeVisible();
  const items = page.getByRole("region", { name: "Items to decide" });
  await expect(items.getByText("0 of 7 decided")).toBeVisible();
  await expect(items.getByRole("cell", { name: /Compressor clutch not engaging/ }).first()).toBeVisible();
  // The refrigerant cannot be claimed: Warranty is offered but disabled, with the reason.
  await expect(payer(page, "AC refrigerant R134a, 500 g").getByRole("radio", { name: /^Warranty\. This part cannot be claimed under warranty\.$/ })).toHaveAttribute("aria-disabled", "true");

  const primary = bar(page).getByRole("button", { name: "Return to service advisor" });
  await expect(primary).toBeDisabled();
  await expect(bar(page).getByText("Choose who pays for every item (7 of 7 not decided yet).")).toBeVisible();
  await expectCleanText(page, "warranty check");
  await shot(page, "p4-warranty-1440");
});

test("B: an outside service record fills the missed gap, and removing it needs a reason", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-527ST");
  await open(page, id);
  const history = page.getByRole("region", { name: "Service history" });
  await history.getByRole("button", { name: "Add outside service record" }).click();
  const dialog = page.getByRole("dialog", { name: "Add outside service record" });
  await dialog.getByRole("button", { name: "Save record" }).click();
  for (const message of ["Enter the service date", "Enter the km reading from the service book", "Enter the dealer that did the service", "Add a photo of the stamped service book page"])
    await expect(dialog.getByText(message)).toBeVisible();
  // Esc does not close a form with input in it.
  await dialog.getByLabel("Dealer").fill("Kia Ikeja");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Service date").fill(lagosDaysAgo(-1));
  await dialog.getByLabel("Km reading").fill("23800");
  await page.locator("input[type=file]").setInputFiles({ name: "stamp.png", mimeType: "image/png", buffer: png() });
  await expect(dialog.getByRole("img", { name: "Stamped service book page" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(dialog.getByText("The service date cannot be in the future")).toBeVisible();
  await dialog.getByLabel("Service date").fill(lagosDaysAgo(95));
  await shot(page, "p4-outside-record-dialog");
  await dialog.getByRole("button", { name: "Save record" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Outside service record added: .*23,800 km, Kia Ikeja$/)).toBeVisible();
  await expect(history.getByText("Regular", { exact: true })).toBeVisible();
  await expect(history.getByText("Service history is regular. No missed services.")).toBeVisible();
  await expect(history.getByRole("group", { name: /^Year 2, quarter 2: On time\..*at Kia Ikeja$/ })).toBeVisible();

  // Remove it again (the creator may), with a reason; the missed service comes back.
  await history.getByRole("button", { name: /^Remove the record of / }).click();
  const remove = page.getByRole("dialog", { name: "Remove outside service record" });
  await remove.getByRole("button", { name: "Remove record" }).click();
  await expect(remove.getByText("Give the reason for removing this record")).toBeVisible();
  await remove.getByLabel("Reason for removing").fill("Stamp belongs to another vehicle");
  await remove.getByRole("button", { name: "Remove record" }).click();
  await expect(remove).toBeHidden();
  await expect(history.getByText("1 missed service", { exact: true })).toBeVisible();
});

test("C: the officer decides who pays; warranty with a missed service needs a reason; the job returns to the advisor", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-527ST");
  await open(page, id);
  for (const item of ["AC system check and refrigerant recharge", "AC compressor"]) {
    await payer(page, item).getByRole("radio", { name: "Warranty", exact: true }).click();
    await expect(payer(page, item).getByRole("radio", { name: "Warranty", exact: true })).toHaveAttribute("aria-checked", "true");
  }
  for (const item of ["AC refrigerant R134a, 500 g", "Replace front brake pads", "Front brake pads set", "Periodic maintenance service", "Engine oil 5W-30, 4 litres"])
    await payer(page, item).getByRole("radio", { name: "Customer pay", exact: true }).click();
  const items = page.getByRole("region", { name: "Items to decide" });
  await expect(items.getByText("7 of 7 decided")).toBeVisible();
  await expect(items.getByText("Write a reason, because the service history is not regular and items are set to warranty or goodwill.")).toBeVisible();
  await expect(bar(page).getByText("Write a reason, because the service history is not regular and items are set to warranty or goodwill.")).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Return to service advisor" })).toBeDisabled();
  await shot(page, "p4-reason-needed");

  await items.getByLabel("Reason").fill("Missed service in year 2 is not related to the AC system");
  await expect(items.getByText("Reason saved")).toBeVisible();
  const primary = bar(page).getByRole("button", { name: "Return to service advisor" });
  await expect(primary).toBeEnabled();
  await expect(bar(page).getByText("Chidi Eze will prepare the estimate.")).toBeVisible();
  await primary.click();
  await expect(page.getByText(/sent to Chidi Eze/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 4 of 8: Estimate" })).toBeVisible();
  await expect(page.getByText(/^With: Chidi Eze/)).toBeVisible();

  // The finished step opens the decisions read-only.
  await page.getByRole("button", { name: /^Warranty completed by Folake Adebayo/ }).click();
  const summary = page.getByRole("region", { name: /^Warranty completed by Folake Adebayo/ });
  await expect(summary.getByText("Missed service in year 2 is not related to the AC system")).toBeVisible();
  await expect(summary.getByRole("radiogroup")).toHaveCount(0);
  await expect(summary.getByText("Warranty", { exact: true }).first()).toBeVisible();
  await expectCleanText(page, "finished warranty step");

  const notices = await (await apiAs(request, "advisor")).get<{ notifications: { title: string; message: string }[] }>("/notifications?limit=10");
  expect(notices.notifications.some((row) => row.title === "Job sent to you" && row.message.includes("Estimate"))).toBe(true);
  const check = await (await apiAs(request, "warranty")).get<{ warrantyCase: { caseNumber: string } | null; items: { payer: string }[] }>(`/service/job-cards/${id}/warranty`);
  expect(check.warrantyCase?.caseNumber).toMatch(/^WTY/);
});

test("D: the advisor sees the step read-only; a technician is told only warranty staff can see it", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-528ST");
  const advisor = await pageAs(browser, "advisor");
  await open(advisor, id);
  await expect(advisor.getByText("Waiting for the warranty officer. You can view this step but only the warranty officer can update it.")).toBeVisible();
  await expect(advisor.getByRole("radiogroup")).toHaveCount(0);
  await expect(advisor.getByText("Not decided").first()).toBeVisible();
  await expect(advisor.getByRole("button", { name: "Add outside service record" })).toHaveCount(0);
  await expectCleanText(advisor, "advisor read-only");
  await advisor.context().close();

  const technician = await pageAs(browser, "technician");
  await open(technician, id);
  await expect(technician.getByText(/^Only warranty staff can see the warranty evidence\./)).toBeVisible();
  await expect(technician.getByRole("region", { name: "Service history" })).toHaveCount(0);
  await shot(technician, "p4-technician-denied");
  await technician.context().close();
  const refused = await (await apiAs(request, "technician")).put(`/service/job-cards/${id}/warranty`, { items: [] });
  expect(refused.status()).toBe(403);
});

test("E: a recall item is charged to the campaign; a regular history needs no reason", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-528ST");
  await open(page, id);
  await expect(page.getByRole("region", { name: "Campaigns and recalls" }).getByText("RC-DM-2601")).toBeVisible();
  const history = page.getByRole("region", { name: "Service history" });
  await expect(history.getByText("Regular", { exact: true })).toBeVisible();
  await payer(page, "General labour (see estimate notes)").getByRole("radio", { name: "Campaign", exact: true }).click();
  await payer(page, "Periodic maintenance service").getByRole("radio", { name: "Customer pay", exact: true }).click();
  await payer(page, "Engine oil 5W-30, 4 litres").getByRole("radio", { name: "Customer pay", exact: true }).click();
  await expect(page.getByRole("region", { name: "Items to decide" }).getByLabel("Reason")).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Return to service advisor" })).toBeEnabled();
  await expectCleanText(page, "campaign decision");
});

test("F: without a sale date the history cannot be checked and the screen says how to fix it", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-529ST");
  await open(page, id);
  const history = page.getByRole("region", { name: "Service history" });
  await expect(history.getByText("Cannot check", { exact: true })).toBeVisible();
  await expect(history.getByText("Service history cannot be checked. No sale date is recorded for this vehicle.")).toBeVisible();
  await expect(history.getByText(/Add the sale date on the vehicle's warranty details/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Coverage" }).getByText("Cannot confirm", { exact: true })).toBeVisible();
  await expect(
    payer(page, "AC compressor").getByRole("radio", { name: /^Warranty\. Not in warranty when the job opened\./ }),
  ).toHaveAttribute("aria-disabled", "true");
  await shot(page, "p4-no-sale-date");
});

test("G: offline, a decision stays on screen as Not saved and Retry saves it", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-529ST");
  await open(page, id);
  await page.context().setOffline(true);
  await payer(page, "AC system check and refrigerant recharge").getByRole("radio", { name: "Goodwill", exact: true }).click();
  await expect(page.getByText(/^Not saved\./).first()).toBeVisible();
  await expect(payer(page, "AC system check and refrigerant recharge").getByRole("radio", { name: "Goodwill", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText(/^Not saved\./)).toHaveCount(0);
  await page.reload();
  await expect(payer(page, "AC system check and refrigerant recharge").getByRole("radio", { name: "Goodwill", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("H: keyboard only: Tab reaches a payer, arrow keys choose", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-529ST");
  await open(page, id);
  const group = payer(page, "AC compressor");
  await group.getByRole("radio", { name: "Goodwill", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  // Campaign is disabled (no campaign linked), so the arrow skips to Customer pay.
  await expect(group.getByRole("radio", { name: "Customer pay", exact: true })).toBeFocused();
  await expect(group.getByRole("radio", { name: "Customer pay", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("I: a skipped warranty step opens read-only from the stepper", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "LSR-515ST");
  await open(page, id, "Step 4 of 8: Estimate");
  await page.getByRole("button", { name: "Warranty skipped. Not under warranty." }).click();
  const summary = page.getByRole("region", { name: "Warranty skipped. Not under warranty." });
  await expect(summary.getByRole("region", { name: "Coverage" }).getByText("Expired", { exact: true })).toBeVisible();
  await expect(summary.getByRole("region", { name: "Service history" })).toBeVisible();
  await expect(summary.getByRole("radiogroup")).toHaveCount(0);
  await shot(page, "p4-skipped-read-only");
});

test("J: check-in shows the service history verdict for a vehicle in warranty", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-482TX");
  const advisor = await pageAs(browser, "advisor");
  await advisor.goto(`/job-cards/${id}`);
  await expect(advisor.getByRole("heading", { name: "Step 1 of 8: Check-in" })).toBeVisible({ timeout: 30_000 });
  // Details is complete, so the job opens on Walk-around; the alert is on Details.
  await advisor.getByRole("tab", { name: /Details, / }).click();
  await expect(advisor.getByText(/^Service history has 3 missed services in warranty year 1\. Warranty items will need the warranty officer's review\.$/)).toBeVisible({ timeout: 30_000 });
  await advisor.context().close();
});

test("K: the warranty check fits tablet and phone widths without sideways scrolling", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-528ST");
  for (const width of [1024, 768, 390]) {
    const page = await pageAs(browser, "warranty", { width, height: 900 });
    await open(page, id);
    await expect(page.getByRole("region", { name: "Items to decide" })).toBeVisible();
    await expectNoHorizontalOverflow(page, `warranty check at ${width}`);
    if (width === 390) {
      await page.getByRole("region", { name: "Service history" }).scrollIntoViewIfNeeded();
      await shot(page, "p4-warranty-390-history");
      await page.getByRole("region", { name: "Items to decide" }).scrollIntoViewIfNeeded();
      await shot(page, "p4-warranty-390-items");
    }
    await page.context().close();
  }
});
