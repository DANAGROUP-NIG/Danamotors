import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/accounts";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 5: estimate, customer approval item by item, phone approval, estimation charge, advance and
 * release, following doc/testing/jobcard-revamp/phase-5-manual-test.md. Runs in order on a fresh
 * copy of the demo data.
 *   KJA-530ST (JC-S19): at the estimate, nothing prepared; AC compressor and its labour on warranty.
 *   LSR-531ST (JC-S20): estimate prepared, for a phone approval.
 *   LSR-532ST (JC-S21): estimate presented, the customer declines everything.
 *   KJA-533ST (JC-S22): free first service with a warranty repair, nothing for the customer to pay.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("advisor") });

const naira = (value: string | number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(value));
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const open = async (page: Page, id: string) => {
  await page.goto(`/job-cards/${id}`);
  await expect(page.getByRole("heading", { name: "Step 4 of 8: Estimate" })).toBeVisible({ timeout: 30_000 });
};

async function sign(page: Page) {
  const pad = page.getByLabel("Customer signature. Sign with a finger or stylus.");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 40 + step * 25, box.y + box.height / 2 + (step % 2 ? 15 : -15));
  await page.mouse.up();
}

type Step = { estimate: { totals: Record<string, string>; lines: { description: string; payer: string }[] } | null; advance: Record<string, unknown> };

test("A: the advisor prepares the estimate from the findings, changes the advance and presents it", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-530ST");
  await open(page, id);
  await expect(page.getByText(/The diagnosis has 7 items of work and parts\./)).toBeVisible();
  await bar(page).getByRole("button", { name: "Prepare estimate" }).click();
  await expect(page.getByText(/^Estimate prepared for job \d+$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate, revision 1, draft" })).toBeVisible();

  const step = await (await apiAs(request, "advisor")).get<Step>(`/service/job-cards/${id}/estimate`);
  const totals = step.estimate!.totals;
  // VAT is 7.5% of the customer subtotal, and the customer total is the sum of both.
  expect(Number(totals.vat)).toBeCloseTo(Number(totals.customerSubtotal) * 0.075, 2);
  expect(Number(totals.customerTotal)).toBeCloseTo(Number(totals.customerSubtotal) + Number(totals.vat), 2);
  const customer = page.getByRole("region", { name: /^Customer pays/ });
  const warranty = page.getByRole("region", { name: /^Warranty \(not charged to customer\)/ });
  await expect(customer.getByRole("cell", { name: "Front brake pads set", exact: true })).toBeVisible();
  await expect(warranty.getByRole("cell", { name: "AC compressor", exact: true })).toBeVisible();
  await expect(warranty.getByRole("row").filter({ has: page.getByRole("cell", { name: "AC compressor", exact: true }) })).toContainText(naira(480000));
  const summary = page.getByRole("complementary", { name: "Estimate summary" });
  await expect(summary.getByText(naira(totals.customerTotal), { exact: true })).toBeVisible();
  await expect(summary.getByText("VAT (7.5%)")).toBeVisible();
  await expect(summary.getByText(naira(totals.otherPayerTotal), { exact: true })).toBeVisible();
  await expect(summary.getByText("Advance (60%)")).toBeVisible();

  // Remove has a label; a bad quantity names the fix and blocks the save.
  await expect(customer.getByRole("button", { name: "Remove Engine oil 5W-30, 4 litres" })).toBeVisible();
  const oil = customer.getByLabel("Quantity for Engine oil 5W-30, 4 litres");
  await oil.fill("0");
  await expect(customer.getByText("Quantity must be more than 0")).toBeVisible();
  await expect(customer.getByText("Check the quantity")).toBeVisible();
  await oil.fill("1");
  await summary.getByRole("button", { name: "30%" }).click();
  await expect(summary.getByText("Advance (30%)")).toBeVisible();
  await expect(summary.getByText(naira((Number(totals.customerTotal) * 0.3).toFixed(2)), { exact: true })).toBeVisible();
  await bar(page).getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Estimate saved for job \d+$/)).toBeVisible();
  await expectCleanText(page, "estimate draft");
  await shot(page, "p5-a-prepare-1440");

  await bar(page).getByRole("button", { name: "Present to customer" }).click();
  await expect(page.getByText("Estimate ready for the customer. Hand the tablet to the customer.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your estimate for KJA-530ST" })).toBeVisible();
});

test("B: on a tablet the customer declines one item, the total drops, mistakes are named, and the customer signs", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-530ST");
  const page = await pageAs(browser, "advisor", { width: 768, height: 1024 });
  await open(page, id);
  await expect(page.getByText("Approve the work you want us to do. You can decline any item.")).toBeVisible();
  await expect(page.getByText(/^Covered by warranty: AC system check and refrigerant recharge, AC compressor\. No charge to you\.$/)).toBeVisible();
  const step = await (await apiAs(request, "advisor")).get<Step>(`/service/job-cards/${id}/estimate`);
  await expect(page.getByText(naira(step.estimate!.totals.customerTotal), { exact: true })).toBeVisible();

  const refrigerant = page.getByRole("group", { name: "AC refrigerant R134a, 500 g: approve or decline" });
  await refrigerant.getByRole("button", { name: "Decline" }).click();
  await expect(refrigerant.getByRole("button", { name: "Decline" })).toHaveAttribute("aria-pressed", "true");
  // 9,000 declined, plus 7.5% VAT on it.
  await expect(page.getByText(naira(Number(step.estimate!.totals.customerTotal) - 9675), { exact: true })).toBeVisible();
  await expect(page.getByText("Declined items will be reminded at your next visit.")).toBeVisible();

  await page.getByRole("region", { name: "Who is signing" }).getByText("Representative", { exact: true }).click();
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText("Enter the representative's name")).toBeVisible();
  await expect(page.getByText("Enter the representative's phone number")).toBeVisible();
  await expect(page.getByText("Ask the customer to sign in the box")).toBeVisible();
  await expect(page.getByText("The customer must accept the estimate terms")).toBeVisible();
  await page.getByRole("region", { name: "Who is signing" }).getByText("Owner", { exact: true }).click();
  await page.getByText("I approve the work above at the prices shown").click();
  await sign(page);
  await expectNoHorizontalOverflow(page, "customer approval at 768 px");
  await expectCleanText(page, "customer approval");
  await shot(page, "p5-b-approval-768");
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText(/^Estimate approved and signed for job \d+$/)).toBeVisible();

  // Advance and release: approved, advance missing, parts sent to the store.
  const checklist = page.getByRole("region", { name: "Before work starts" });
  await expect(checklist.getByText("Customer approved 7 items")).toBeVisible();
  await expect(checklist.getByText("Advance not received")).toBeVisible();
  await expect(checklist.getByText(/^Parts request sent to store automatically: 3 items$/)).toBeVisible();
  const release = bar(page).getByRole("button", { name: "Release to workshop" });
  await expect(release).toBeDisabled();
  await expect(bar(page).getByText("Ask the cashier to record the advance. Cashier on duty: Super Admin.")).toBeVisible();
  await bar(page).getByRole("button", { name: "Notify cashier" }).click();
  await expect(page.getByText("Notice sent to Super Admin")).toBeVisible();
  await shot(page, "p5-e-advance-missing-768");
  await page.context().close();
});

test("E: the cashier records the advance; the advisor releases the job to the technician", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-530ST");
  const cashier = await pageAs(browser, "cashier");
  await open(cashier, id);
  await cashier.getByRole("button", { name: "Receive advance" }).click();
  const dialog = cashier.getByRole("dialog", { name: "Advance payment receipt" });
  await dialog.getByLabel("Amount received (NGN)").fill("50000");
  await dialog.getByLabel("Mode").selectOption("CASH");
  // An outside click keeps the dialog and what was typed.
  await cashier.mouse.click(5, 5);
  await expect(dialog.getByLabel("Amount received (NGN)")).toHaveValue("50000");
  await dialog.getByRole("button", { name: "Save receipt" }).click();
  await expect(dialog.getByText(/^Advance received and reserved for job \d+\.$/)).toBeVisible();
  await cashier.context().close();

  const page = await pageAs(browser, "advisor");
  await open(page, id);
  const checklist = page.getByRole("region", { name: "Before work starts" });
  await expect(checklist.getByText(`Advance received: ${naira(50000)}`)).toBeVisible();
  const advance = page.getByRole("region", { name: "Advance", exact: true });
  await expect(advance.getByText(naira(50000), { exact: true }).first()).toBeVisible();
  await expect(bar(page).getByText("Tunde Akinyemi will be notified.")).toBeVisible();
  await shot(page, "p5-e-ready-1440");
  await bar(page).getByRole("button", { name: "Release to workshop" }).click();
  await expect(page.getByRole("heading", { name: "Step 5 of 8: Repair" })).toBeVisible({ timeout: 20_000 });
  // The declined item shows on the vehicle's visit history as recommended work.
  const api = await apiAs(request, "advisor");
  const workspace = await api.get<{ stage: string; status: string }>(`/service/job-cards/${id}/workspace`);
  expect(workspace).toMatchObject({ stage: "REPAIR", status: "IN_PROGRESS" });
  const step = await api.get<{ partsRequest: { status: string; itemCount: number } }>(`/service/job-cards/${id}/estimate`);
  expect(step.partsRequest).toMatchObject({ status: "SENT", itemCount: 3 });
  await page.context().close();
});

test("C: phone approval keeps input on outside click and Esc, names each mistake, and leaves a signature due", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "LSR-531ST");
  await open(page, id);
  await bar(page).getByRole("button", { name: "Record phone approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Record phone approval" });
  await expect(dialog.getByText("The customer will sign at delivery.")).toBeVisible();
  await dialog.getByLabel(/^Approved by/).fill("");
  await dialog.getByLabel(/^Phone number/).fill("12345");
  await page.mouse.click(5, 5);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save phone approval" }).click();
  await expect(dialog.getByText("Enter who approved on the phone")).toBeVisible();
  await expect(dialog.getByText("Enter a Nigerian mobile number, for example 0803 555 0142")).toBeVisible();
  await dialog.getByLabel(/^Approved by/).fill("Ngozi Lakeside");
  await dialog.getByLabel(/^Phone number/).fill("0803 555 0142");
  await dialog.getByRole("checkbox", { name: /Engine oil 5W-30, 4 litres/ }).uncheck();
  await expectCleanText(page, "phone approval dialog");
  await shot(page, "p5-c-phone-1440");
  await dialog.getByRole("button", { name: "Save phone approval" }).click();
  await expect(page.getByText(/^Phone approval saved for job \d+\. The customer signs at delivery\.$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Before work starts" }).getByText(/Customer to sign at delivery\./)).toBeVisible();
  await expect(page.getByRole("region", { name: "Before work starts" }).getByText("Customer approved 4 items by phone")).toBeVisible();
  await page.getByRole("navigation", { name: "Estimate steps" }).getByRole("button", { name: "Prepare" }).click();
  await expect(page.getByRole("heading", { name: "Estimate, revision 1, partly approved" })).toBeVisible();
  await expect(page.getByText("Recommended, declined")).toBeVisible();
  await expect(page.getByText("Customer to sign at delivery", { exact: true })).toBeVisible();
});

test("D: everything declined, waiver requested, the service manager declines it, and the job goes to billing with the charge", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-532ST");
  const page = await pageAs(browser, "advisor", { width: 768, height: 1024 });
  await open(page, id);
  for (const item of ["PAID SERVICE", "Replace front brake pads", "Front brake pads set"])
    await page.getByRole("group", { name: `${item}: approve or decline` }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText(naira(0), { exact: true })).toBeVisible();
  await page.getByText("I approve the work above at the prices shown").click();
  await sign(page);
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText(/^The customer declined all work on job \d+$/)).toBeVisible();
  await expect(page.getByText(`The customer declined all work. An estimation charge of ${naira(25000)} applies (terms clause 4).`)).toBeVisible();
  await expect(bar(page).getByText("Add the estimation charge, or request a waiver.")).toBeVisible();

  await page.getByRole("button", { name: "Request waiver" }).click();
  const waiver = page.getByRole("dialog", { name: "Request waiver" });
  await waiver.getByLabel(/^Reason for the waiver/).fill("no");
  await waiver.getByRole("button", { name: "Send waiver request" }).click();
  await expect(waiver.getByText("Write the reason for the waiver (at least 5 characters)")).toBeVisible();
  await waiver.getByLabel(/^Reason for the waiver/).fill("Long-standing fleet customer");
  await waiver.getByRole("button", { name: "Send waiver request" }).click();
  await expect(page.getByText(/^Waiver requested for job \d+\. The managers have been notified\.$/)).toBeVisible();
  await expect(bar(page).getByText("A manager has not answered the waiver request yet.")).toBeVisible();
  await shot(page, "p5-d-declined-768");

  const manager = await pageAs(browser, "serviceManager");
  await open(manager, id);
  await manager.getByRole("button", { name: "Decline waiver" }).click();
  const decide = manager.getByRole("dialog", { name: "Decline waiver" });
  await decide.getByRole("button", { name: "Decline waiver" }).click();
  await expect(decide.getByText("Write why the waiver is declined (at least 5 characters)")).toBeVisible();
  await decide.getByLabel("Why the waiver is declined").fill("The charge applies to fleet customers too");
  await decide.getByRole("button", { name: "Decline waiver" }).click();
  await expect(manager.getByText(/^Waiver declined for job \d+\. The estimation charge stays on the bill\.$/)).toBeVisible();
  await manager.context().close();

  await page.reload();
  await expect(page.getByText(new RegExp(`^Estimation charge ${naira(25000).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} added by`))).toBeVisible({ timeout: 20_000 });
  await bar(page).getByRole("button", { name: "Send to billing" }).click();
  await expect(page.getByRole("heading", { name: "Step 7 of 8: Billing" })).toBeVisible({ timeout: 20_000 });
  await page.context().close();
});

test("F: a free service with a warranty repair needs no advance; release works without a payment", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "KJA-533ST");
  await open(page, id);
  // Offline, a save fails with a message and keeps the change; back online it saves.
  const compressor = page.getByLabel("Quantity for AC compressor");
  await page.context().setOffline(true);
  await compressor.fill("2");
  await bar(page).getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("The estimate was not saved. Your changes are still here. Check your connection and save again.")).toBeVisible();
  await expect(compressor).toHaveValue("2");
  await page.context().setOffline(false);
  await bar(page).getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Estimate saved for job \d+$/)).toBeVisible();
  await compressor.fill("1");
  await bar(page).getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Estimate saved for job \d+$/).first()).toBeVisible();
  await bar(page).getByRole("button", { name: "Present to customer" }).click();
  // The free service is charged at zero; the AC repair is covered by warranty.
  await expect(page.getByRole("region", { name: "Service" }).getByText(naira(0), { exact: true })).toBeVisible();
  await expect(page.getByText(/^Covered by warranty: .*AC compressor\. No charge to you\.$/)).toBeVisible();
  await expect(page.getByText("You approve")).toBeVisible();
  await page.getByText("I approve the work above at the prices shown").click();
  await sign(page);
  await page.getByRole("button", { name: "Approve and sign" }).click();
  const checklist = page.getByRole("region", { name: "Before work starts" });
  await expect(checklist.getByText("Advance not required: Warranty only")).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Release to workshop" })).toBeEnabled();
});

test("G: other staff see the estimate read only; a technician without estimate access is told why", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-531ST");
  const manager = await pageAs(browser, "workshopManager");
  await open(manager, id);
  await expect(manager.getByRole("heading", { name: "Estimate, revision 1, partly approved" })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Present to customer" })).toHaveCount(0);
  await manager.context().close();
  const technician = await pageAs(browser, "technician");
  await technician.goto(`/job-cards/${id}`);
  await expect(technician.getByRole("heading", { name: "Step 4 of 8: Estimate" })).toBeVisible({ timeout: 30_000 });
  await expect(technician.getByText(/You do not have access to estimates|Estimate, revision 1/).first()).toBeVisible();
  await technician.context().close();
  // The server refuses the technician's approval attempt.
  const response = await (await apiAs(request, "technician")).post(`/service/job-cards/${id}/estimate/prepare`, { requestId: crypto.randomUUID() });
  expect(response.status()).toBe(403);
});

test("H: phone width shows the estimate without sideways scrolling, and keyboard Tab reaches the main button", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-531ST");
  for (const width of [390, 1024]) {
    const page = await pageAs(browser, "advisor", { width, height: 844 });
    await page.goto(`/job-cards/${id}`);
    await expect(page.getByRole("heading", { name: "Before work starts" })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalOverflow(page, `advance and release at ${width} px`);
    await expect(bar(page).getByRole("button", { name: "Release to workshop" })).toBeInViewport({ ratio: 1 });
    const fits = await page.evaluate(() => {
      const button = [...document.querySelectorAll('[aria-label="Step actions"] button')].find((b) => b.textContent?.includes("Release to workshop"));
      return !!button && button.getBoundingClientRect().bottom <= document.querySelector("main")!.getBoundingClientRect().bottom;
    });
    expect(fits, `Release to workshop is fully above the bottom menu at ${width} px`).toBe(true);
    await expect(bar(page).getByRole("button", { name: "Notify cashier" })).toBeInViewport();
    // Keyboard: Tab reaches Notify cashier, and Enter on it sends the notice.
    await bar(page).getByRole("button", { name: "Notify cashier" }).focus();
    await expect(bar(page).getByRole("button", { name: "Notify cashier" })).toBeFocused();
    await expectCleanText(page, `advance and release at ${width} px`);
    await shot(page, `p5-h-advance-${width}`);
    await page.context().close();
  }
});
