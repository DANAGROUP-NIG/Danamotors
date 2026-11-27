import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/accounts";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 6: repair, following doc/testing/jobcard-revamp/phase-6-manual-test.md. Runs in order on a
 * fresh copy of the demo data.
 *   KJA-534ST (JC-S23): service done, brakes in progress, AC (warranty) waiting parts; pads and oil ready to collect.
 *   LSR-535ST (JC-S24): the technician found a torn rear wiper blade; no supplementary estimate yet.
 *   LSR-536ST (JC-S25): supplementary estimate, revision 2, presented to the customer.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("technician") });

const PHONE = { width: 390, height: 844 };
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const workItem = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
/** The dev server sometimes answers 404 while it first compiles the job page; one reload fixes that. */
async function settle(page: Page) {
  const step = page.getByRole("heading", { name: "Step 5 of 8: Repair" });
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(step.or(notFound)).toBeVisible({ timeout: 30_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(step).toBeVisible({ timeout: 30_000 });
}
const open = async (page: Page, id: string) => {
  await page.goto(`/job-cards/${id}`);
  await settle(page);
};

async function sign(page: Page, label: string) {
  const pad = page.getByLabel(label);
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 30 + step * 20, box.y + box.height / 2 + (step % 2 ? 12 : -12));
  await page.mouse.up();
}

test("A: My jobs on a phone lists the technician's jobs by tab, with counts and a next action", async ({ browser }) => {
  const page = await pageAs(browser, "technician", PHONE);
  await page.goto("/my-jobs");
  await expect(page.getByRole("heading", { name: "My jobs" })).toBeVisible({ timeout: 30_000 });
  const today = page.getByRole("tab", { name: /^Today \(\d+\)$/ });
  await expect(today).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("listitem").filter({ hasText: "KJA-534ST" });
  await expect(card).toContainText("In repair");
  await expect(card).toContainText("Next: Collect parts");
  await expect(card).toContainText("2 items ready at the store.");
  await expect(card).toContainText(/Promised: /);
  await expect(card.getByRole("link", { name: /^Collect parts, KJA-534ST$/ })).toBeVisible();
  await expect(page.getByText(/₦|NGN/)).toHaveCount(0);
  // Keyboard: arrow keys move between tabs.
  await today.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Waiting parts \(\d+\)$/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Done \(\d+\)$/ })).toBeFocused();
  await expect(page.getByText("You have not sent a job for the quality check today.")).toBeVisible();
  await expectNoHorizontalOverflow(page, "My jobs at 390 px");
  await expectCleanText(page, "My jobs");
  await shot(page, "p6-my-jobs-390");
  await page.getByRole("tab", { name: /^Today/ }).click();
  await card.getByRole("link", { name: /Collect parts/ }).click();
  await settle(page);
  await page.context().close();
});

test("B: the technician's work list, the blocked quality check, and collecting parts with a signature", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
  await expect(workItem(page, "PAID SERVICE")).toContainText(/Done \d\d:\d\d/);
  await expect(workItem(page, "Replace front brake pads").getByRole("button", { name: "Done" })).toBeEnabled();
  const ac = workItem(page, "AC system check and refrigerant recharge");
  await expect(ac).toContainText("Waiting parts");
  await expect(ac).toContainText("Warranty");
  await expect(ac.getByRole("button", { name: "Continue" })).toBeVisible();
  // Send for quality check is disabled with its reason.
  await expect(bar(page).getByRole("button", { name: "Send for quality check" })).toBeDisabled();
  await expect(bar(page)).toContainText("Finish all work first: 2 items left.");
  await expect(page.getByText("2 of 3 ready to collect at store")).toBeVisible();
  await expect(page.getByText("AC compressor: requested from the store, not ready yet")).toBeVisible();
  await expectNoHorizontalOverflow(page, "Repair at 390 px");
  await expectCleanText(page, "Repair, technician");
  await shot(page, "p6-repair-technician-390");
  await page.getByRole("heading", { name: "Your work" }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await shot(page, "p6-work-list-390");
  await page.getByRole("button", { name: "Need a part" }).scrollIntoViewIfNeeded();
  await shot(page, "p6-parts-card-390");

  await page.getByRole("button", { name: "Collect and sign" }).click();
  const sheet = page.getByRole("dialog", { name: "Collect parts" });
  await expect(sheet.getByText("Front brake pads set")).toBeVisible();
  await expect(sheet.getByText(/Your signature confirms you received these parts from /)).toBeVisible();
  // Mistakes: nothing ticked and no signature.
  for (const box of await sheet.getByRole("checkbox").all()) await box.uncheck();
  await sheet.getByRole("button", { name: "Sign and collect" }).click();
  await expect(sheet.getByText("Tick at least one part you are collecting")).toBeVisible();
  await expect(sheet.getByText("Sign in the box to confirm you received the parts")).toBeVisible();
  // Esc and an outside click keep the sheet open.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  for (const box of await sheet.getByRole("checkbox").all()) await box.check();
  await expect(sheet.getByText("Tick at least one part you are collecting")).toBeHidden();
  await sign(page, "Sign to confirm you collected these parts");
  await expect(sheet.getByText("Sign in the box to confirm you received the parts")).toBeHidden();
  await shot(page, "p6-collect-sheet-390");
  await sheet.getByRole("button", { name: "Sign and collect" }).click();
  await expect(page.getByText("2 parts collected and signed for")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("1 part is not ready at the store yet.")).toBeVisible();
  await page.context().close();
});

test("C: Done records the time and the labour; Waiting parts and Continue keep the clock right", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  await workItem(page, "Replace front brake pads").getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Replace front brake pads marked done")).toBeVisible();
  await expect(workItem(page, "Replace front brake pads")).toContainText(/Done \d\d:\d\d/);
  await expect(bar(page)).toContainText("Finish all work first: 1 item left.");
  const step = await (await apiAs(request, "advisor")).get<{ labour: { description: string; hours: string }[] }>(`/service/job-cards/${id}/repair`);
  expect(step.labour).toEqual([expect.objectContaining({ description: "Replace front brake pads", hours: "1.00" })]);
  await page.context().close();
});

test("D: Need a part names every mistake, then sends the finding to the advisor and locks the work", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  await page.getByRole("button", { name: "Need a part" }).click();
  let sheet = page.getByRole("dialog", { name: "Need a part" });
  await sheet.getByRole("button", { name: "Send to service advisor" }).click();
  await expect(sheet.getByText("Say why the part is needed, in at least 3 characters")).toBeVisible();
  await expect(sheet.getByText("Choose the part you need")).toBeVisible();
  await sheet.getByLabel("Why is the part needed?").fill("Rear wiper blade torn, smears the screen.");
  await sheet.getByRole("button", { name: "Choose a part" }).click();
  const picker = page.getByRole("dialog", { name: "Add a part needed" });
  await picker.getByRole("searchbox").or(picker.getByRole("textbox")).first().fill("wiper");
  await picker.getByRole("button", { name: /Rear wiper blade/ }).first().click();
  sheet = page.getByRole("dialog", { name: "Need a part" });
  // What was typed survives the picker.
  await expect(sheet.getByLabel("Why is the part needed?")).toHaveValue("Rear wiper blade torn, smears the screen.");
  await sheet.getByLabel("Quantity").fill("0");
  await sheet.getByRole("button", { name: "Send to service advisor" }).click();
  await expect(sheet.getByText("Enter a quantity above 0, with at most 2 decimal places")).toBeVisible();
  await sheet.getByLabel("Quantity").fill("1");
  await sheet.getByRole("button", { name: "Send to service advisor" }).click();
  await expect(page.getByText(/^Sent to .+ for a supplementary estimate$/)).toBeVisible();
  const locked = workItem(page, "Rear wiper blade");
  await expect(locked).toContainText("Waiting for estimate");
  await expect(locked).toContainText("Do not start this work until the customer approves it.");
  await expect(bar(page)).toContainText("A new finding is waiting for the service advisor's supplementary estimate.");
  const notices = await (await apiAs(request, "advisor")).get<{ notifications: { title: string; message: string }[] }>("/notifications?limit=10");
  expect(notices.notifications.some((row) => row.title === "New finding during repair" && row.message.includes("Rear wiper blade torn"))).toBe(true);
  await page.context().close();
});

test("E: Pause job for parts stops the work until Resume repair", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  await page.getByRole("button", { name: "Pause job" }).click();
  const dialog = page.getByRole("dialog", { name: "Pause job" });
  await expect(dialog.getByRole("radio", { name: "Waiting parts" })).toBeChecked();
  await dialog.getByLabel("Which parts (optional)").fill("AC compressor");
  await dialog.getByRole("button", { name: "Pause job" }).click();
  await expect(page.getByText("The job is paused while it waits for parts.")).toBeVisible();
  const ac = workItem(page, "AC system check and refrigerant recharge");
  await expect(ac.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(ac).toContainText("The job is paused for parts. Resume the job first.");
  await expect(page.getByRole("button", { name: /^Pause job/ })).toBeDisabled();
  await bar(page).getByRole("button", { name: "Resume repair" }).click();
  await expect(page.getByText("The job is paused while it waits for parts.")).toBeHidden();
  await expect(ac.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.context().close();
});

test("F: the advisor sees progress, parts and labour, and prepares the supplementary estimate for the new finding", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-535ST");
  const page = await pageAs(browser, "advisor");
  await open(page, id);
  const banner = page.getByRole("status").filter({ hasText: "New finding from" });
  await expect(banner).toContainText("Rear wiper blade torn. It smears the rear screen.");
  await expect(banner).toContainText("The customer must approve before this work is done.");
  await expect(banner).toContainText("Work already approved continues.");
  await expect(page.getByRole("heading", { name: "Work progress" })).toBeVisible();
  await expect(page.getByText("2 of 2 done")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parts" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Collected by technician" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Labour recorded" })).toBeVisible();
  await expectCleanText(page, "Repair, advisor");
  await expectNoHorizontalOverflow(page, "Repair, advisor at 1440 px");
  await shot(page, "p6-repair-advisor-1440");
  await page.getByRole("heading", { name: "Work progress" }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await shot(page, "p6-advisor-tables-1440");

  await banner.getByRole("button", { name: "Prepare supplementary estimate" }).click();
  await expect(page.getByText(/^Supplementary estimate, revision 2, prepared for job \d+$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate, revision 2 (supplementary), draft" })).toBeVisible();
  const supplementary = page.getByRole("region", { name: "Estimate, revision 2 (supplementary), draft" });
  await expect(supplementary).toBeInViewport();
  await expect(supplementary.getByText("Rear wiper blade", { exact: true })).toBeVisible();
  // Only the new lines: the approved brake work is not on the supplementary estimate.
  await expect(supplementary.getByText("Front brake pads set", { exact: true })).toHaveCount(0);
  const summary = page.getByRole("complementary", { name: "Estimate summary" });
  await expect(summary.getByText("Suggested advance")).toHaveCount(0);
  await shot(page, "p6-supplementary-1440");
  // Mistakes in the sheets clear as soon as they are fixed (checked on the technician side in B).

  await bar(page).getByRole("button", { name: "Record phone approval" }).click();
  const dialog = page.getByRole("dialog", { name: "Record phone approval" });
  await dialog.getByLabel(/^Phone number/).fill("0803 555 0142");
  await dialog.getByRole("button", { name: "Save phone approval" }).click();
  await expect(page.getByText(/^Phone approval saved for job \d+\. The customer signs at delivery\.$/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Work progress" }).getByText("Replace rear wiper blade")).toBeVisible();
  const tech = await (await apiAs(request, "technician")).get<{ notifications: { title: string }[] }>("/notifications?limit=10");
  expect(tech.notifications.some((row) => row.title === "Supplementary work approved")).toBe(true);
  await page.context().close();
});

test("G: a presented supplementary estimate is approved on the tablet, new lines only", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-536ST");
  const page = await pageAs(browser, "advisor", { width: 1024, height: 900 });
  await open(page, id);
  const heading = page.getByRole("heading", { name: /Extra work found on LSR-536ST/ });
  await expect(heading).toBeVisible();
  // The customer sees and decides only the new work.
  const approval = heading.locator("xpath=../..");
  await expect(approval.getByText("Rear wiper blade", { exact: true })).toBeVisible();
  await expect(approval.getByText("Front brake pads set", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page, "Supplementary approval at 1024 px");
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText("Ask the customer to sign in the box")).toBeVisible();
  await expect(page.getByText("The customer must accept the estimate terms")).toBeVisible();
  await page.getByText("I approve the work above at the prices shown").click();
  await expect(page.getByText("The customer must accept the estimate terms")).toBeHidden();
  await sign(page, "Customer signature. Sign with a finger or stylus.");
  await expect(page.getByText("Ask the customer to sign in the box")).toBeHidden();
  await shot(page, "p6-supplementary-approval-1024");
  await page.getByRole("button", { name: "Approve and sign" }).click();
  await expect(page.getByText(/^Estimate approved and signed for job \d+$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work progress" })).toBeVisible();
  await page.context().close();
});

test("H2: the approved supplementary work is done and the job goes to the quality check; My jobs shows it under Done", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-535ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  const wiper = workItem(page, "Replace rear wiper blade");
  await expect(wiper).toContainText("Added during repair");
  await wiper.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Replace rear wiper blade started")).toBeVisible();
  await wiper.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Replace rear wiper blade marked done")).toBeVisible();
  const send = bar(page).getByRole("button", { name: "Send for quality check" });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText(/^Job \d+ sent to /)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 6 of 8: Quality check" })).toBeVisible();
  const toast = await page.getByText(/^Job \d+ sent to /).innerText();
  test.info().annotations.push({ type: "toast", description: toast });
  const supervisor = await (await apiAs(request, "workshopManager")).get<{ notifications: { title: string; message: string }[] }>("/notifications?limit=10");
  test.info().annotations.push({ type: "supervisor notices", description: supervisor.notifications.map((row) => row.title).join(" | ") });
  expect(supervisor.notifications.some((row) => row.message.includes("LSR-535ST"))).toBe(true);

  await page.goto("/my-jobs");
  await page.getByRole("tab", { name: /^Done/ }).click();
  const card = page.getByRole("listitem").filter({ hasText: "LSR-535ST" });
  await expect(card).toContainText(/Sent for quality check at \d\d:\d\d\./);
  await expect(card.getByRole("link", { name: /^View job/ })).toBeVisible();

  // Offline: a tab that cannot load says so, with Try again.
  await page.context().setOffline(true);
  await page.getByRole("tab", { name: /^Waiting parts/ }).click();
  await expect(page.getByText("Your jobs could not be loaded. Check your connection and try again.")).toBeVisible({ timeout: 20_000 });
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Your jobs could not be loaded. Check your connection and try again.")).toBeHidden();
  await page.context().close();
});

test("H: someone else's step: another technician sees it read only and the server refuses changes", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "otherTechnician", PHONE);
  await open(page, id);
  await expect(page.getByText(/Waiting for .+\(Technician\)\. You can view this step but only the technician can update it\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Collect and sign" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Need a part" })).toHaveCount(0);
  const step = await (await apiAs(request, "technician")).get<{ workLines: { id: string; status: string }[] }>(`/service/job-cards/${id}/repair`);
  const line = step.workLines.find((row) => row.status !== "DONE")!;
  const refused = await (await apiAs(request, "otherTechnician")).post(`/service/job-cards/${id}/repair/lines/${line.id}`, { action: "START", requestId: crypto.randomUUID() });
  expect(refused.status()).toBe(403);
  await page.context().close();

  // The advisor on My jobs is pointed to Job cards.
  const advisor = await pageAs(browser, "advisor", PHONE);
  await advisor.goto("/my-jobs");
  await expect(advisor.getByText(/My jobs lists the jobs assigned to you as a technician\./)).toBeVisible({ timeout: 30_000 });
  await advisor.context().close();
});

test("I: offline, Done fails with a message and Try again works once back online", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  const page = await pageAs(browser, "technician", PHONE);
  await open(page, id);
  const ac = workItem(page, "AC system check and refrigerant recharge");
  await page.context().setOffline(true);
  await ac.getByRole("button", { name: "Continue" }).click();
  await expect(ac.getByRole("alert")).toContainText("The work was not updated. Check your connection and try again.");
  await page.context().setOffline(false);
  await ac.getByRole("button", { name: "Try again" }).click();
  await expect(ac.getByRole("button", { name: "Done" })).toBeVisible();
  await page.context().close();
});

test("J: tablet and desktop widths keep everything on screen", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "KJA-534ST");
  for (const [role, width] of [["technician", 768], ["advisor", 1024], ["advisor", 390]] as const) {
    const page = await pageAs(browser, role, { width, height: 900 });
    await open(page, id);
    await expectNoHorizontalOverflow(page, `Repair as ${role} at ${width} px`);
    await expectCleanText(page, `Repair as ${role} at ${width} px`);
    await shot(page, `p6-repair-${role}-${width}`);
    await page.context().close();
  }
});
