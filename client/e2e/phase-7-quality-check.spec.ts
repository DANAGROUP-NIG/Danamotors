import { expect, test, type Page } from "@playwright/test";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 7: quality check, following doc/testing/jobcard-revamp/phase-7-manual-test.md. Runs in order on
 * a fresh copy of the demo data.
 *   LSR-537ST (JC-S26): all work done, waiting for the quality check.
 *   LSR-538ST (JC-S27): failed on the brake pads, back with the technician.
 *   LSR-539ST (JC-S28): failed once, repaired, back for a second check.
 */
test.describe.configure({ mode: "serial" });

const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 390, height: 844 };
const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const workRow = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });

/** The dev server sometimes answers 404 while it first compiles the job page; one reload fixes that. */
async function open(page: Page, id: string, heading: string) {
  await page.goto(`/job-cards/${id}`);
  const step = page.getByRole("heading", { name: heading });
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(step.or(notFound)).toBeVisible({ timeout: 30_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(step).toBeVisible({ timeout: 30_000 });
}
const QC = "Step 6 of 8: Quality check";

async function sign(page: Page) {
  const pad = page.getByLabel("Sign to certify the vehicle as roadworthy");
  await pad.scrollIntoViewIfNeeded();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 30 + step * 20, box.y + box.height / 2 + (step % 2 ? 12 : -12));
  await page.mouse.up();
}

async function passEverything(page: Page) {
  for (const row of await page.getByRole("group", { name: /: pass or fail$/ }).all()) await row.getByRole("button", { name: "Pass" }).click();
  for (const label of ["No warning lights on dashboard", "Fluid levels correct", "Wheel nuts torqued", "Vehicle interior clean"]) await page.getByLabel(label).check({ force: true });
  await page.getByLabel("AC outlet temperature").fill("6");
}

test("A: the supervisor fails the check on a tablet; the form catches mistakes; the job goes back to repair", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-537ST");
  const page = await pageAs(browser, "workshopManager", TABLET);
  await open(page, id, QC);
  for (const card of ["Approved work", "General checks", "Road test", "Certification"]) await expect(page.getByRole("heading", { name: card, exact: true })).toBeVisible();
  await expect(page.getByText("Vehicle checked and certified as roadworthy in all respects.")).toBeVisible();
  await expect(page.getByLabel("Start km")).toHaveValue("48262");
  // Pass is disabled with every reason.
  const pass = bar(page).getByRole("button", { name: "Pass quality check" });
  await expect(pass).toBeDisabled();
  await expect(bar(page)).toContainText("Check every work item: 2 left. 3 more things to do before you can pass.");
  // Km and temperature mistakes are shown under the field.
  await page.getByLabel("End km").fill("48250");
  await expect(page.getByText("End km must be the same as or higher than start km.").first()).toBeVisible();
  await page.getByLabel("AC outlet temperature").fill("55");
  await expect(page.getByText("Enter the temperature in °C between 0 and 40, or leave it empty.")).toBeVisible();
  await page.getByLabel("AC outlet temperature").fill("");
  await page.getByLabel("End km").fill("48270");
  await expectNoHorizontalOverflow(page, "Quality check at 1024 px");
  await expectCleanText(page, "Quality check, supervisor");
  await shot(page, "p7-qc-1024");

  // Fail: mark the brake pads Fail, then the dialog needs a note.
  await workRow(page, "Replace front brake pads").getByRole("button", { name: "Fail" }).click();
  await expect(workRow(page, "Replace front brake pads").getByRole("button", { name: "Fail" })).toHaveAttribute("aria-pressed", "true");
  await expect(bar(page)).toContainText("Check every work item: 1 left. 3 more things to do before you can pass.");
  await bar(page).getByRole("button", { name: "Fail and return to technician" }).click();
  const dialog = page.getByRole("dialog", { name: "Fail and return to technician" });
  await expect(dialog.getByLabel("Replace front brake pads")).toBeChecked();
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(dialog.getByText("Write what the technician must fix.")).toBeVisible();
  await dialog.getByLabel("Replace front brake pads").uncheck({ force: true });
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(dialog.getByText("Mark Fail on the work items that need rework.")).toBeVisible();
  await dialog.getByLabel("Replace front brake pads").check({ force: true });
  await dialog.getByLabel("What must the technician fix").fill("Brake still noisy at low speed. Recheck front left caliper slider.");
  // An outside click and Esc keep the dialog and the text.
  await page.mouse.click(5, 5);
  await page.keyboard.press("Escape");
  await expect(dialog.getByLabel("What must the technician fix")).toHaveValue("Brake still noisy at low speed. Recheck front left caliper slider.");
  await expectCleanText(page, "Fail dialog", dialog);
  await shot(page, "p7-fail-dialog-1024");
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(page.getByText("Job 2026000042 returned to the technician.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 5 of 8: Repair" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Returned from quality check").first()).toBeVisible();
  await page.context().close();
});

test("B: the technician sees the return on My jobs and the job, redoes the failed work and sends it back", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-537ST");
  // The failed check told the technician.
  const notices = await (await apiAs(request, "technician")).get<{ notifications: { title: string; message: string }[] }>("/notifications?limit=10");
  expect(notices.notifications.some((row) => row.title.includes("QC failed") && row.message.includes("2026000042"))).toBe(true);
  const page = await pageAs(browser, "technician", PHONE);
  await page.goto("/my-jobs");
  await expect(page.getByRole("heading", { name: "My jobs" })).toBeVisible({ timeout: 30_000 });
  const card = page.getByRole("listitem").filter({ hasText: "LSR-537ST" });
  await expect(card).toContainText("Returned from quality check");
  await expect(card).toContainText("Brake still noisy at low speed. Recheck front left caliper slider.");
  await open(page, id, "Step 5 of 8: Repair");
  const banner = page.getByRole("status").filter({ hasText: "Returned from quality check" });
  await expect(banner).toContainText("Returned by Rotimi Ajayi,");
  await expect(banner).toContainText("Note: Brake still noisy at low speed. Recheck front left caliper slider.");
  const brakes = workRow(page, "Replace front brake pads");
  await expect(brakes).toContainText("Returned from quality check");
  await expect(brakes).toContainText("Not started");
  await expect(workRow(page, "PAID SERVICE")).toContainText(/Done \d\d:\d\d/);
  await expectNoHorizontalOverflow(page, "Returned job at 390 px");
  await expectCleanText(page, "Returned job, technician");
  await shot(page, "p7-returned-390");
  await brakes.getByRole("button", { name: "Start" }).click();
  await expect(brakes.getByRole("button", { name: "Done" })).toBeEnabled();
  await brakes.getByRole("button", { name: "Done" }).click();
  await expect(brakes).toContainText(/Done \d\d:\d\d/);
  await expect(brakes).not.toContainText("Returned from quality check");
  await bar(page).getByRole("button", { name: "Send for quality check" }).click();
  await expect(page.getByRole("heading", { name: QC })).toBeVisible({ timeout: 30_000 });
  await page.context().close();
});

test("C: the second check passes with the road test and signature; history keeps both checks; the advisor has it", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-537ST");
  const page = await pageAs(browser, "workshopManager", TABLET);
  await open(page, id, QC);
  await expect(page.getByRole("heading", { name: "Earlier checks" })).toBeVisible();
  await expect(page.getByText("Failed work")).toBeVisible();
  await expect(page.getByRole("region", { name: "Approved work" }).getByRole("listitem").filter({ hasText: "Replace front brake pads" })).toContainText("Redone after a failed check");
  await passEverything(page);
  await page.getByLabel("End km").fill("48270");
  await page.getByLabel("Notes (optional)").fill("Road test completed. No abnormal noise.");
  await expect(bar(page).getByText("Sign the certification.", { exact: true })).toBeVisible();
  await sign(page);
  const pass = bar(page).getByRole("button", { name: "Pass quality check" });
  await expect(pass).toBeEnabled();
  await expect(bar(page)).toContainText("The service advisor takes the job for billing.");
  await shot(page, "p7-qc-ready-1024");
  await pass.click();
  await expect(page.getByText("Quality check passed on job 2026000042. The service advisor has the job.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Step 7 of 8: Billing" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Job file" }).click();
  await page.getByRole("tab", { name: "Activity" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Quality check passed. Moved to Billing")).toBeVisible();
  await expect(drawer.getByText("Quality check failed. Returned to Repair")).toBeVisible();
  await expectCleanText(page, "Activity after the quality check", drawer);
  await shot(page, "p7-activity-1024");
  await page.context().close();
});

test("D: someone else sees the check read only; a technician is refused by the server", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-539ST");
  const page = await pageAs(browser, "advisor");
  await open(page, id, QC);
  await expect(page.getByText("Only the workshop supervisor or the service manager can do the quality check.")).toBeVisible();
  await expect(page.getByText("Result: Not checked yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quality checks" })).toBeVisible();
  await expect(page.getByText("Pads squeal under light braking. Clean and grease the caliper sliders.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pass quality check" })).toHaveCount(0);
  await expectCleanText(page, "Quality check, read only");
  await shot(page, "p7-read-only-1440");
  await page.context().close();
  const api = await apiAs(request, "technician");
  const refused = await api.post(`/service/job-cards/${id}/quality-check`, {
    requestId: crypto.randomUUID(), outcome: "FAIL", lines: [], general: [], acOutletTempC: null, roadTestStartKm: null, roadTestEndKm: null, roadTestNotes: null, notes: "x", signatureImage: null,
  });
  expect(refused.status()).toBe(403);
});

test("E: every width without sideways scrolling, keyboard toggles, and an offline pass that keeps the entries", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-539ST");
  const page = await pageAs(browser, "workshopManager");
  await open(page, id, QC);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(page.getByRole("heading", { name: "Approved work", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Quality check at ${width} px`);
    await shot(page, `p7-qc-${width}`);
    if (width === 390) {
      for (const card of ["Approved work", "General checks", "Road test", "Certification"]) {
        await page.getByRole("heading", { name: card, exact: true }).evaluate((element) => element.scrollIntoView({ block: "start" }));
        await shot(page, `p7-qc-390-${card.toLowerCase().replace(/\s/g, "-")}`);
      }
    }
  }
  // Keyboard: Tab reaches the Pass buttons and Enter presses them.
  await page.setViewportSize({ width: 1024, height: 768 });
  const firstPass = page.getByRole("group", { name: /: pass or fail$/ }).first().getByRole("button", { name: "Pass" });
  await firstPass.focus();
  await page.keyboard.press("Enter");
  await expect(firstPass).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: /: pass or fail$/ }).first().getByRole("button", { name: "Fail" })).toHaveAttribute("aria-pressed", "true");
  await passEverything(page);
  await page.getByLabel("End km").fill("49123");
  await sign(page);
  await page.context().setOffline(true);
  await bar(page).getByRole("button", { name: "Pass quality check" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /not saved|connection/i }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("End km")).toHaveValue("49123");
  await shot(page, "p7-offline-1024");
  await page.context().setOffline(false);
  await bar(page).getByRole("button", { name: "Pass quality check" }).click();
  await expect(page.getByRole("heading", { name: "Step 7 of 8: Billing" })).toBeVisible({ timeout: 30_000 });
  await page.context().close();
});
