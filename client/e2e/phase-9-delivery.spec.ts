import { expect, test, type Page } from "@playwright/test";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 9: delivery, following doc/testing/jobcard-revamp/phase-9-manual-test.md. Runs in order on a fresh copy
 * of the demo data.
 *   LSR-544ST (JC-S33): paid; two estimates approved by phone to sign; air filter declined; wiper added.
 *   LSR-545ST (JC-S34): on credit, the promised time has passed.
 *   LSR-546ST (JC-S35): paid; the owner's brother signed the job card at check-in.
 *   LSR-547ST (JC-S36): delivered, with the gate pass and the follow-up call date.
 */
test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DELIVERY = "Step 8 of 8: Delivery";
const COMPLETE = "Complete delivery and print gate pass";
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const card = (page: Page, title: string) => page.getByRole("region", { name: title, exact: true });

/** The dev server sometimes answers 404 while it first compiles the job page; one reload fixes that. */
async function open(page: Page, id: string, heading: string) {
  await page.goto(`/job-cards/${id}`);
  const step = page.getByRole("heading", { name: heading });
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(step.or(notFound)).toBeVisible({ timeout: 30_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(step).toBeVisible({ timeout: 30_000 });
}

async function sign(page: Page, label: string) {
  const pad = page.getByLabel(label);
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 30 + step * 20, box.y + box.height / 2 + (step % 2 ? 12 : -12));
  await page.mouse.up();
}

/** window.print is counted instead of opening the print dialog. */
async function countPrints(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
}
const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);

test("A: the owner collects; the phone approvals are signed first; belongings and the collector are checked", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-544ST");
  const page = await pageAs(browser, "advisor", TABLET);
  await countPrints(page);
  await open(page, id, DELIVERY);
  for (const title of ["Work done", "Declined, recommended for next visit", "Estimate approved by phone", "Your belongings", "Collected by", "Customer signature"])
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(card(page, "Work done").getByText("(added with your approval)")).toBeVisible();
  await expect(card(page, "Declined, recommended for next visit").getByText("Air filter element")).toBeVisible();
  await expect(card(page, "Estimate approved by phone").getByText(/^Revision 1, approved on the phone by .+, \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
  await expect(card(page, "Estimate approved by phone").getByText(/^Revision 2, approved on the phone by/)).toBeVisible();
  await expect(card(page, "Estimate approved by phone").getByText(/^₦[\d,]+\.\d{2}$/).first()).toBeVisible();
  await expect(card(page, "Your belongings").getByText("Umbrella in boot")).toBeVisible();
  await expect(card(page, "Your belongings").getByRole("checkbox")).toHaveCount(8);
  await expect(page.getByText("The customer signs the estimate approved by phone first. Then they sign here.")).toBeVisible();
  await expect(bar(page).getByRole("button", { name: COMPLETE })).toBeDisabled();
  await expect(bar(page)).toContainText("The customer must first sign the estimate they approved on the phone. 3 more things to do before delivery.");
  await expectCleanText(page, "Delivery before signing");
  await expectNoHorizontalOverflow(page, "Delivery at 768 px");
  await shot(page, "p9-handover-768");
  for (const title of ["Work done", "Your belongings", "Customer signature"]) {
    await card(page, title).scrollIntoViewIfNeeded();
    await shot(page, `p9-handover-768-${title.toLowerCase().replace(/ /g, "-")}`);
  }

  // The estimate signature: a signature is needed, then it is saved and the card goes.
  await card(page, "Estimate approved by phone").getByRole("button", { name: "Save estimate signature" }).click();
  await expect(page.getByText("Ask the customer to sign in the box.")).toBeVisible();
  await sign(page, "Customer signs for the estimate approved by phone");
  await card(page, "Estimate approved by phone").getByRole("button", { name: "Save estimate signature" }).click();
  await expect(page.getByText("The customer signed the estimate they approved on the phone.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate approved by phone", exact: true })).toBeHidden();

  // Belongings: one left unticked blocks the delivery with the reason.
  await card(page, "Your belongings").getByRole("button", { name: "Tick all returned" }).click();
  await card(page, "Your belongings").getByLabel("Returned").last().uncheck();
  await page.getByLabel("Adaeze Okafor (owner)").check();
  await sign(page, "Customer signs to take delivery of the vehicle");
  await expect(bar(page)).toContainText("Tick Returned for every belonging: 1 is not ticked yet.");

  // Someone else: the clause 7 warning; the advisor must name the person before asking a manager.
  await page.getByLabel("Someone else").check();
  await expect(card(page, "Collected by").getByText(/^Terms clause 7: the vehicle is released only to the owner/)).toBeVisible();
  await card(page, "Collected by").getByRole("button", { name: "Ask a manager to approve" }).click();
  await expect(page.getByText("Enter the full name of the person collecting.")).toBeVisible();
  await shot(page, "p9-someone-else-768");

  // The owner, every belonging, the signature: delivered, the gate pass prints, all 8 steps done.
  await page.getByLabel("Adaeze Okafor (owner)").check();
  await card(page, "Your belongings").getByLabel("Returned").last().check();
  await expect(bar(page)).toContainText("The customer must sign to take delivery.");
  await sign(page, "Customer signs to take delivery of the vehicle");
  await expect(bar(page).getByRole("button", { name: COMPLETE })).toBeEnabled();
  await bar(page).getByRole("button", { name: COMPLETE }).click();
  await expect(page.getByText(/^Job \d+ delivered\. Gate pass \d+ issued\.$/)).toBeVisible();
  // Phase 11: the A6 gate pass slip opens and prints; Back to job card shows the delivered summary.
  await expect(page).toHaveURL(new RegExp(`/job-cards/${id}/gate-pass/print\\?print=1$`), { timeout: 30_000 });
  await expect.poll(() => printed(page)).toBe(1);
  await page.getByRole("link", { name: "Back to job card" }).click();
  await expect(page.getByText(/^Delivered to Adaeze Okafor, \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible({ timeout: 30_000 });
  await expect(card(page, "Gate pass").getByRole("link", { name: "Print gate pass" })).toBeVisible();
  await expect(page.getByText(/^Follow-up call scheduled for \d{1,2} \w{3} 2026\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Closed job" })).toBeVisible();
  await expectCleanText(page, "Delivered summary");
  await card(page, "Gate pass").scrollIntoViewIfNeeded();
  await shot(page, "p9-delivered-768");
});

test("B: late delivery needs reasons; the entries survive a lost connection; others see it read only", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-545ST");
  // A technician sees the step read only and the server refuses them.
  const tech = await pageAs(browser, "technician");
  await open(tech, id, DELIVERY);
  await expect(tech.getByText(/^Waiting for .+\. You can view this step but only/)).toBeVisible();
  await expect(card(tech, "Your belongings").getByRole("checkbox")).toHaveCount(0);
  await expect(tech.getByRole("button", { name: COMPLETE })).toHaveCount(0);
  await expectCleanText(tech, "Delivery read only");
  const techApi = await apiAs(request, "technician");
  const refused = await techApi.post(`/service/job-cards/${id}/delivery`, {
    requestId: crypto.randomUUID(), collectorType: "OWNER", returnedCodes: [], lateReasonIds: [], accepted: true, signatureImage: "data:image/png;base64,iVBORw0KGgo=",
  });
  expect([401, 403]).toContain(refused.status());

  const page = await pageAs(browser, "advisor", { width: 1024, height: 768 });
  await open(page, id, DELIVERY);
  await expect(page.getByText(/^Delivered after the promised time of \d{1,2} \w{3} 2026, \d{2}:\d{2}\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estimate approved by phone", exact: true })).toHaveCount(0);
  // Keyboard: Tick all returned with Enter, the owner with Space.
  await card(page, "Your belongings").getByRole("button", { name: "Tick all returned" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel(/\(owner\)/).focus();
  await page.keyboard.press("Space");
  await sign(page, "Customer signs to take delivery of the vehicle");
  await expect(bar(page)).toContainText("The promised time has passed. Choose 1 to 6 reasons for late delivery.");
  await expect(bar(page).getByRole("button", { name: COMPLETE })).toBeDisabled();
  await card(page, "Reasons for late delivery").getByRole("checkbox").first().check();
  await page.getByLabel("Delay remark (optional)").fill("Parts arrived late from the supplier.");
  await expectNoHorizontalOverflow(page, "Late delivery at 1024 px");
  await card(page, "Reasons for late delivery").scrollIntoViewIfNeeded();
  await shot(page, "p9-late-1024");
  // Offline: the save fails at once and keeps everything.
  await page.context().setOffline(true);
  await bar(page).getByRole("button", { name: COMPLETE }).click();
  await expect(page.getByText(/The delivery could not be saved\. Check your connection and try again\. Your entries are kept\./)).toBeVisible();
  await expect(page.getByLabel("Delay remark (optional)")).toHaveValue("Parts arrived late from the supplier.");
  await expect(card(page, "Reasons for late delivery").getByRole("checkbox").first()).toBeChecked();
  await page.context().setOffline(false);
  await bar(page).getByRole("button", { name: COMPLETE }).click();
  await expect(page.getByText(/^Job \d+ delivered\. Gate pass \d+ issued\.$/)).toBeVisible();
  await expect(card(page, "Handover").getByText("Parts arrived late from the supplier.")).toBeVisible();
});

test("C: someone else collects with a service manager's approval; the check-in signer is offered", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-546ST");
  const advisor = await pageAs(browser, "advisor");
  await countPrints(advisor);
  await open(advisor, id, DELIVERY);
  await expect(advisor.getByLabel("Kunle Adeyemi (signed at check-in)")).toBeVisible();
  await expect(card(advisor, "Collected by").getByText("Matches job card signer")).toHaveCount(1);
  await advisor.getByLabel("Someone else").check();
  await advisor.getByLabel("Name of the person collecting").fill("Bola Ade");
  await card(advisor, "Collected by").getByRole("button", { name: "Ask a manager to approve" }).click();
  await expect(advisor.getByText(/^Asked .+ to approve the release\.$/)).toBeVisible();

  // The service manager approves from the job, which is read only for them otherwise.
  const manager = await pageAs(browser, "serviceManager");
  await open(manager, id, DELIVERY);
  await expect(card(manager, "Collected by").getByRole("alert")).toContainText("Terms clause 7");
  await card(manager, "Collected by").getByRole("button", { name: "Approve release to someone else" }).click();
  const dialog = manager.getByRole("dialog", { name: "Approve release to someone else" });
  await dialog.getByRole("button", { name: "Approve release" }).click();
  await expect(dialog.getByText("Enter the full name of the person collecting.")).toBeVisible();
  await expect(dialog.getByText("Enter the phone number.")).toBeVisible();
  await expect(dialog.getByText("Write why the vehicle can be released to this person (at least 10 characters).")).toBeVisible();
  await dialog.getByLabel("Full name of the person collecting").fill("Bola Ade");
  await dialog.getByLabel("Their phone number").fill("123");
  await dialog.getByRole("button", { name: "Approve release" }).click();
  await expect(dialog.getByText("Enter a Nigerian mobile number, for example 0803 555 0142.")).toBeVisible();
  await dialog.getByLabel("Their phone number").fill("0803 999 8888");
  await dialog.getByLabel("Reason").fill("The owner phoned to send his driver, who showed his ID.");
  await manager.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await manager.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await expectCleanText(manager, "Release approval dialog", dialog);
  await dialog.getByRole("button", { name: "Approve release" }).click();
  await expect(manager.getByText("Release to Bola Ade approved.")).toBeVisible();
  await expect(card(manager, "Collected by").getByText(/^Release to Bola Ade \(08039998888\) approved by .+ \(Service manager\)/)).toBeVisible();
  await shot(manager, "p9-release-approved-1440");

  // The advisor sees the approval and hands the vehicle to the approved person.
  await advisor.reload();
  await expect(advisor.getByRole("heading", { name: DELIVERY })).toBeVisible({ timeout: 30_000 });
  await advisor.getByLabel("Someone else").check();
  await expect(card(advisor, "Collected by").getByText(/^Release to Bola Ade/)).toBeVisible();
  await card(advisor, "Your belongings").getByRole("button", { name: "Tick all returned" }).click();
  await sign(advisor, "Customer signs to take delivery of the vehicle");
  await expect(card(advisor, "Customer signature").getByText("Signing as Bola Ade.")).toBeVisible();
  await bar(advisor).getByRole("button", { name: COMPLETE }).click();
  await expect(advisor.getByRole("heading", { name: "Gate pass", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(advisor.getByRole("row", { name: "Collected by Bola Ade" })).toBeVisible();
  await advisor.getByRole("link", { name: "Back to job card" }).click();
  await expect(advisor.getByText(/^Delivered to Bola Ade, \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible({ timeout: 30_000 });
  await expect(card(advisor, "Handover").getByText("Someone else, approved by a manager")).toBeVisible();
  await shot(advisor, "p9-someone-else-delivered-1440");
});

test("D: a delivered job is a read-only summary at every size; the follow-up call shows on the PSF screen", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-547ST");
  for (const [viewport, name] of [[{ width: 1440, height: 900 }, "1440"], [{ width: 1024, height: 768 }, "1024"], [TABLET, "768"], [PHONE, "390"]] as const) {
    const page = await pageAs(browser, "advisor", viewport);
    await open(page, id, "Closed job");
    await expect(page.getByText(/^Delivered to .+, \d{1,2} \w{3} 2026, \d{2}:\d{2}$/)).toBeVisible();
    await expect(page.getByText(/^Follow-up call scheduled for \d{1,2} \w{3} 2026\.$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Print gate pass" })).toBeVisible();
    await expect(page.getByRole("button", { name: COMPLETE })).toHaveCount(0);
    await expectNoHorizontalOverflow(page, `Delivered summary at ${name} px`);
    await expectCleanText(page, `Delivered summary at ${name} px`);
    await card(page, "Gate pass").scrollIntoViewIfNeeded();
    await shot(page, `p9-closed-${name}`);
  }
  const admin = await pageAs(browser, "admin");
  await admin.goto(`/psf?job=${id}`);
  await expect(admin.getByText("Call due", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByText(/^\d{1,2} \w{3} 2026$/).first()).toBeVisible();
});

test("E: the follow-up call days for the branch", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/settings/company");
  await expect(page.getByRole("heading", { name: "Company & branch settings" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Follow-up call", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Follow-up call after delivery (days)")).toHaveValue("2");
});
