import { expect, test, type Page } from "@playwright/test";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 8: billing, following doc/testing/jobcard-revamp/phase-8-manual-test.md. Runs in order on a fresh
 * copy of the demo data.
 *   LSR-540ST (JC-S29): quality check passed, not yet marked ready.
 *   LSR-541ST (JC-S30): ready and notified four days ago, washed: storage is proposed on the invoice.
 *   LSR-542ST (JC-S31): invoiced, the advance applied, a balance left.
 *   LSR-543ST (JC-S32): invoiced and unpaid, for a credit approval.
 * Locally there is no billing officer at Main Branch: the super admin creates invoices and records payments.
 */
test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const BILLING = "Step 7 of 8: Billing";
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const card = (page: Page, title: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/** The dev server sometimes answers 404 while it first compiles the job page; one reload fixes that. */
async function open(page: Page, id: string, heading: string) {
  await page.goto(`/job-cards/${id}`);
  const step = page.getByRole("heading", { name: heading });
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(step.or(notFound)).toBeVisible({ timeout: 30_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(step).toBeVisible({ timeout: 30_000 });
}

test("A: the advisor marks the vehicle ready and records the notice; the form catches mistakes", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-540ST");
  const page = await pageAs(browser, "advisor");
  await open(page, id, BILLING);
  for (const title of ["Customer notified", "Estimated and actual", "Invoice"]) await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("The customer has not been told yet. Marking the vehicle ready records the notice.")).toBeVisible();
  await expect(page.getByText("Storage charge of ₦2,000.00 per day starts 48 hours after the customer is told the vehicle is ready (terms clause 3).")).toBeVisible();
  await expect(card(page, "Invoice").getByRole("button", { name: "Create invoice" })).toBeDisabled();
  await expect(page.getByText("Mark the vehicle ready before creating the invoice.")).toBeVisible();
  await expect(page.getByText("The invoice amounts appear here once the vehicle is marked ready.")).toBeVisible();
  await expect(card(page, "Estimated and actual").getByRole("rowheader", { name: "Service charge" })).toBeVisible();
  await expectCleanText(page, "Billing before ready");
  await expectNoHorizontalOverflow(page, "Billing at 1440 px");
  await shot(page, "p8-ready-1440");

  // The dialog: channel required; Esc and outside click keep it open; Cancel closes it.
  await bar(page).getByRole("button", { name: "Mark ready and notify customer" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark ready and notify customer" });
  await dialog.getByRole("button", { name: "Mark ready and save notice" }).click();
  await expect(dialog.getByText("Choose how you told the customer: phone call or SMS.")).toBeVisible();
  await dialog.getByLabel("Note (optional)").fill("Customer will collect tomorrow morning.");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("SMS").check();
  await expect(dialog.getByText("The app does not send SMS yet.")).toBeVisible();
  await dialog.getByLabel("Phone call").check();
  await expectCleanText(page, "Mark ready dialog", dialog);
  await dialog.getByRole("button", { name: "Mark ready and save notice" }).click();
  await expect(page.getByText(/marked ready\. The customer notice is recorded\./)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Phone call to .+ on \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByText(/Storage charge of ₦2,000\.00 per day starts after \d{1,2} \w{3} 2026, \d{2}:\d{2} \(terms clause 3\)\./)).toBeVisible();
  // Not invoiced: delivery waits, with the reason.
  await expect(bar(page).getByRole("button", { name: "Send to delivery" })).toBeDisabled();
  await expect(bar(page)).toContainText("Create the invoice before sending the job to delivery.");
  await expect(page.getByText("Only billing staff can create the invoice.")).toBeVisible();
  await expect(page.getByText("Not created yet. The amounts are what the invoice will show.")).toBeVisible();
  await expect(card(page, "Invoice").getByText("Advance paid")).toBeVisible();

  // Washed is saved straight away and names who ticked it.
  // The tick is saved at once; the label text is the click target, as staff use it.
  await page.getByText("Vehicle washed", { exact: true }).click();
  await expect(page.getByLabel("Vehicle washed")).toBeChecked();
  await expect(page.getByText("Vehicle washed recorded.")).toBeVisible();
  await expect(page.getByLabel("Vehicle washed")).toBeChecked();
  await shot(page, "p8-notified-1440");
});

test("B: billing creates the invoice; a due storage charge must be accepted or removed with a reason", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-541ST");
  const page = await pageAs(browser, "cashier");
  await open(page, id, BILLING);
  await expect(page.getByText(/\d+ days? so far: ₦[\d,]+\.00 will be proposed on the invoice\./)).toBeVisible();
  await expect(page.getByLabel("Vehicle washed")).toBeChecked();
  await page.getByText("Earlier notices (1)").click();
  await expect(page.getByText(/^Phone call to .+ on \d{1,2} \w{3} 2026, \d{2}:\d{2}, by .+\. Told the customer the vehicle is ready for collection\.$/)).toBeVisible();
  await card(page, "Invoice").getByRole("button", { name: "Create invoice" }).click();
  const dialog = page.getByRole("dialog", { name: "Create invoice" });
  await expect(dialog.getByText(/Storage charge proposed: ₦[\d,]+\.00/)).toBeVisible();
  await expect(dialog.getByText("Total before storage")).toBeVisible();
  await dialog.getByRole("button", { name: "Create invoice" }).click();
  await expect(dialog.getByText("Accept the storage charge, or remove it with a reason.")).toBeVisible();
  await dialog.getByLabel("Remove, with a reason").check();
  await dialog.getByRole("button", { name: "Create invoice" }).click();
  await expect(dialog.getByText("Give the reason for removing the storage charge.")).toBeVisible();
  await dialog.getByLabel("Reason for removing the storage charge").fill("Customer was abroad. Waived by the service manager.");
  await expectCleanText(page, "Create invoice dialog", dialog);
  await shot(page, "p8-create-invoice-1440");
  await dialog.getByRole("button", { name: "Create invoice" }).click();
  await expect(page.getByText(/^Invoice \d+ created\.$/)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(card(page, "Invoice").getByText(/^Invoice \d+, \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
  await expect(card(page, "Invoice").getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(card(page, "Invoice").getByRole("link", { name: "View invoice" })).toBeVisible();
  await expect(page.getByText(/Counted to the invoice: \d+ days?, ₦[\d,]+\.00\./)).toBeVisible();
  await expectCleanText(page, "Billing after invoice");
  // The removed storage charge is not on the invoice.
  await card(page, "Invoice").getByRole("link", { name: "View invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\//);
  await expect(page.getByText("Front brake pads set").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Storage charge,/)).toHaveCount(0);

  // The advisor cannot send it on yet.
  const advisor = await pageAs(browser, "advisor");
  await open(advisor, id, BILLING);
  await expect(bar(advisor).getByRole("button", { name: "Send to delivery" })).toBeDisabled();
  await expect(bar(advisor)).toContainText(/Balance of ₦[\d,]+\.\d{2} not yet paid\./);
  await shot(advisor, "p8-unpaid-1440");
});

test("C: the cashier records the balance; the advisor sends the job to delivery", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-542ST");
  const page = await pageAs(browser, "cashier");
  await open(page, id, BILLING);
  const invoice = card(page, "Invoice");
  await expect(invoice.getByText("Unpaid", { exact: true })).toBeVisible();
  await invoice.getByRole("button", { name: "Record payment" }).click();
  const receipt = page.getByRole("dialog", { name: "Payment receipt" });
  await expect(receipt.getByLabel("Amount received (NGN)")).not.toHaveValue("");
  await receipt.getByLabel("Mode").selectOption("CASH");
  await receipt.getByRole("button", { name: "Save receipt" }).click();
  await expect(page.getByText("Payment receipt created")).toBeVisible();
  await expect(invoice.getByText("Paid", { exact: true })).toBeVisible();
  await expect(invoice.getByText("The invoice is paid in full.")).toBeVisible();

  const advisor = await pageAs(browser, "advisor");
  await open(advisor, id, BILLING);
  const send = bar(advisor).getByRole("button", { name: "Send to delivery" });
  await expect(send).toBeEnabled();
  await expect(bar(advisor)).toContainText("The job goes to the Delivery step with the service advisor.");
  await send.click();
  await expect(advisor.getByRole("heading", { name: "Step 8 of 8: Delivery" })).toBeVisible({ timeout: 30_000 });
  await expect(advisor.getByText(/With: .*Service advisor/).first()).toBeVisible();
  await expectCleanText(advisor, "Delivery after billing");
  await advisor.getByRole("button", { name: "Job file" }).click();
  await advisor.getByRole("tab", { name: "Activity" }).click();
  const drawer = advisor.getByRole("dialog");
  for (const line of ["Moved from Billing to Delivery", "Step owner changed (Billing)", "Mark ready and notify customer (Billing)"])
    await expect(drawer.getByText(line).first()).toBeVisible();
  await expectCleanText(advisor, "Activity after billing", drawer);
});

test("D: the service manager approves credit; the screen names who and the job can go on unpaid", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-543ST");
  const page = await pageAs(browser, "serviceManager");
  await open(page, id, BILLING);
  await page.getByRole("button", { name: "Approve delivery on credit" }).click();
  const dialog = page.getByRole("dialog", { name: "Approve delivery on credit" });
  await dialog.getByRole("button", { name: "Approve delivery on credit" }).click();
  await expect(dialog.getByText("Enter why delivery on credit is approved.")).toBeVisible();
  await dialog.getByLabel("Reason for credit approval").fill("Lakeside fleet account on 30-day credit terms.");
  await dialog.getByRole("button", { name: "Approve delivery on credit" }).click();
  await expect(page.getByText(/^Delivery on credit approved for job \d+\.$/)).toBeVisible();
  await expect(page.getByText(/^Credit approved by .+ \(Service manager\), \d{1,2} \w{3} 2026, \d{2}:\d{2}\.$/)).toBeVisible();
  await shot(page, "p8-credit-1440");

  const advisor = await pageAs(browser, "advisor");
  await open(advisor, id, BILLING);
  await expect(bar(advisor).getByRole("button", { name: "Send to delivery" })).toBeEnabled();
});

test("E: someone else's step is read only, and the server refuses", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-541ST");
  const page = await pageAs(browser, "technician");
  await open(page, id, BILLING);
  await expect(page.getByRole("heading", { name: "Invoice", exact: true })).toBeVisible();
  await expect(page.getByLabel("Vehicle washed")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send to delivery" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
  const tech = await apiAs(request, "technician");
  const refused = await tech.post(`/service/job-cards/${id}/billing/notices`, { requestId: crypto.randomUUID(), channel: "SMS" });
  expect(refused.status()).toBe(403);
  const washed = await tech.put(`/service/job-cards/${id}/billing/washed`, { washed: false });
  expect(washed.status()).toBe(403);
});

test("F: tablet and phone sizes, keyboard only, and a lost connection keeps the entries", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-541ST");
  for (const [viewport, name] of [[TABLET, "768"], [PHONE, "390"]] as const) {
    const page = await pageAs(browser, "advisor", viewport);
    await open(page, id, BILLING);
    await expect(page.getByRole("heading", { name: "Estimated and actual", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Billing at ${name} px`);
    await shot(page, `p8-billing-${name}`);
  }
  const page = await pageAs(browser, "advisor", { width: 1024, height: 768 });
  await open(page, id, BILLING);
  await expectNoHorizontalOverflow(page, "Billing at 1024 px");
  // Keyboard: focus Send again and press Enter; Esc does not close the form; Tab reaches Cancel.
  await page.getByRole("button", { name: "Send again" }).focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Record another notice" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("SMS").focus();
  await page.keyboard.press("Space");
  await dialog.getByLabel("Note (optional)").fill("Second reminder.");
  // Offline: the save fails at once, says so, and keeps what was typed.
  await page.context().setOffline(true);
  await dialog.getByRole("button", { name: "Save notice" }).click();
  await expect(dialog.getByText(/The notice could not be saved\. Check your connection and try again\. Your entries are kept\./)).toBeVisible();
  await expect(dialog.getByLabel("Note (optional)")).toHaveValue("Second reminder.");
  await page.context().setOffline(false);
  await dialog.getByRole("button", { name: "Save notice" }).click();
  await expect(page.getByText("Customer notice recorded.")).toBeVisible();
  await expect(page.getByText(/^SMS sent to .+ on \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
});

test("G: the storage charge settings for the branch", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/settings/company");
  await expect(page.getByRole("heading", { name: "Company & branch settings" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Storage charge", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Free storage (hours)")).toHaveValue("48");
  await expect(page.getByLabel("Storage charge per day (₦)")).toHaveValue("2000");
  await expectCleanText(page, "Company and branch settings");
});
