import { expect, test } from "@playwright/test";
import { authFile } from "./support/accounts";
import { expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot, WIDTHS } from "./support/helpers";

/**
 * Phases 0 and 1: the step on the job card list, and the staged job card frame (header, stepper,
 * finished steps, waiting banner, Job file, cancel dialog, page states, widths).
 * Demo jobs JC-S01 to JC-S10, one at every step (doc/demo-data.md).
 */
const STAGE_JOBS = [
  { plate: "KJA-482TX", step: "Check-in", title: "Step 1 of 8: Check-in" },
  { plate: "LSR-512ST", step: "Diagnosis", title: "Step 2 of 8: Diagnosis" },
  { plate: "LSR-513ST", step: "Diagnosis", title: "Step 2 of 8: Diagnosis" },
  { plate: "KJA-514ST", step: "Warranty", title: "Step 3 of 8: Warranty" },
  { plate: "LSR-515ST", step: "Estimate", title: "Step 4 of 8: Estimate" },
  { plate: "LSR-516ST", step: "Repair", title: "Step 5 of 8: Repair" },
  { plate: "LSR-517ST", step: "Quality check", title: "Step 6 of 8: Quality check" },
  { plate: "LSR-518ST", step: "Billing", title: "Step 7 of 8: Billing" },
  { plate: "LSR-519ST", step: "Delivery", title: "Step 8 of 8: Delivery" },
] as const;

test.use({ storageState: authFile("advisor") });

test.describe("phase 0: job card list", () => {
  test("shows a readable status and the step for each job, with no raw codes", async ({ page }) => {
    await page.goto("/job-cards");
    await expect(page.getByRole("columnheader", { name: "Step" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Status" })).toBeVisible();
    const search = page.getByPlaceholder("Search by job #, customer, vehicle...");
    const row = page.getByRole("row").filter({ hasText: "KJA-482TX" }).first();
    // On a cold dev server the first Enter can land before React hydrates the box; search again until it filters.
    await expect(async () => {
      await search.fill("KJA-482TX");
      await search.press("Enter");
      await expect(page.getByRole("row").filter({ hasText: "KJA-528ST" })).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
    await expect(row).toContainText("Check-in");
    await expect(row).toContainText("Open");
    await expect(row).not.toContainText("OPEN");
    await expectCleanText(page, "job card list");
    await shot(page, "phase0-list-1440");
  });
});

test.describe("phase 1: staged job card frame", () => {
  for (const job of STAGE_JOBS) {
    test(`${job.plate} opens on ${job.step} with a complete header`, async ({ page, request }) => {
      await page.goto(`/job-cards/${await jobIdByPlate(request, job.plate)}`);
      await expect(page.getByRole("heading", { name: job.title })).toBeVisible();
      await expect(page.getByText(job.plate).first()).toBeVisible();
      await expect(page.getByText(/^With: /).first()).toBeVisible();
      await expect(page.getByText("Promised delivery:")).toBeVisible();
      await expect(page.getByRole("button", { name: "Job file" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Print/ })).toBeVisible();
      await expect(page.getByText(/^(Warranty|Non-warranty)$/).first()).toBeVisible();
      await expectCleanText(page, `${job.plate} frame`);
    });
  }

  test("finished steps show who did them and open read only", async ({ page, request }) => {
    await page.goto(`/job-cards/${await jobIdByPlate(request, "LSR-519ST")}`);
    const summary = page.getByRole("button", { name: /^Check-in completed by/ });
    await expect(summary).toBeVisible();
    await summary.click();
    await expect(page.getByText("Customer consent", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Fuel level", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Half (1/2)").first()).toBeVisible();
    await expect(page.getByText(/^Warranty skipped/).first()).toBeVisible();
    await expectCleanText(page, "finished step summary");
  });

  test("the Job file drawer has five tabs and closes with Esc", async ({ page, request }) => {
    await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-482TX")}`);
    await page.getByRole("button", { name: "Job file" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    for (const tab of ["Customer and vehicle", "Visit history", "Warranty and campaigns", "Documents and prints", "Activity"]) {
      await drawer.getByRole("tab", { name: tab }).click();
      await expect(drawer.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      await expectCleanText(page, `Job file ${tab}`);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("Cancel job asks for a reason and does not close on Esc", async ({ page, request }) => {
    await page.goto(`/job-cards/${await jobIdByPlate(request, "LSR-512ST")}`);
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Cancel job" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("LSR-512ST");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep job" }).click();
    await expect(dialog).toBeHidden();
  });

  test("someone who does not own the step sees it read only with the waiting banner", async ({ browser, request }) => {
    const page = await pageAs(browser, "technician");
    await page.goto(`/job-cards/${await jobIdByPlate(request, "KJA-482TX")}`);
    await expect(page.getByText("Waiting for Chidi Eze (Service advisor). You can view this step but only the service advisor can update it.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send to workshop supervisor" })).toHaveCount(0);
    await expectCleanText(page, "technician view");
    await page.context().close();
  });

  test("a missing job and another branch's job show clear page states", async ({ page, browser, request }) => {
    await page.goto("/job-cards/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Job card not found")).toBeVisible();
    const other = await pageAs(browser, "abujaAdmin");
    await other.goto(`/job-cards/${await jobIdByPlate(request, "KJA-482TX")}`);
    await expect(other.getByText("You cannot open this job card")).toBeVisible();
    await other.context().close();
  });

  for (const width of WIDTHS) {
    test(`fits ${width} px wide with no sideways scrolling`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
      await page.goto(`/job-cards/${await jobIdByPlate(request, "LSR-516ST")}`);
      await expect(page.getByRole("heading", { name: "Step 5 of 8: Repair" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `repair job at ${width}`);
      await shot(page, `phase1-frame-${width}`);
      await page.goto("/job-cards");
      await expect(page.getByRole("heading", { name: "Job Cards" })).toBeVisible();
      await expectNoHorizontalOverflow(page, `job list at ${width}`);
    });
  }
});
