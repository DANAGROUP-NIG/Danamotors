import { expect, test, type Page } from "@playwright/test";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, pageAs, shot, WIDTHS } from "./support/helpers";

/**
 * Phase 10: the workshop board, following doc/testing/jobcard-revamp/phase-10-manual-test.md, on a fresh copy of
 * the demo data (JC-S01 to JC-S36: jobs at every step, overdue, repeat and warranty jobs at Main Branch).
 *   KJA-482TX (JC-S01): Check-in.   LSR-516ST (JC-S06): Repair, paused for parts.
 */
test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };
const COLUMNS = ["Check-in", "Diagnosis", "Warranty check", "Awaiting approval", "In repair", "Waiting parts", "Quality check", "Ready"];
const FIGURES = ["In workshop", "Awaiting approval", "Waiting parts", "Ready for collection", "Overdue"];
const columns = (page: Page) => page.getByRole("region", { name: /Workshop board columns/ });
const column = (page: Page, label: string) => columns(page).getByRole("region", { name: new RegExp(`^${label} \\d+`) });

type Board = { branchId: string; summary: Record<string, number>; columns: { key: string; total: number }[] };

async function openBoard(page: Page, query = "") {
  await page.goto(`/job-cards${query}`);
  await expect(page.getByRole("heading", { name: "Workshop board" })).toBeVisible({ timeout: 60_000 });
}

test("A: the workshop supervisor opens on the board with the figures, eight columns and linked cards", async ({ browser, request }) => {
  const board = await (await apiAs(request, "workshopManager")).get<Board>("/service/job-cards/board");
  const page = await pageAs(browser, "workshopManager");
  await openBoard(page);
  await expect(page.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Updated \d{2}:\d{2}\. The board refreshes every minute\.$/)).toBeVisible();
  const figures = page.locator("dl");
  for (const label of FIGURES) await expect(figures.getByText(label, { exact: true })).toBeVisible();
  await expect(figures.locator("div").filter({ hasText: "In workshop" }).locator("dd")).toHaveText(String(board.summary.inWorkshop));
  await expect(figures.locator("div").filter({ hasText: "Overdue" }).locator("dd")).toHaveText(String(board.summary.overdue));
  for (const label of COLUMNS) await expect(column(page, label)).toBeVisible();
  await expect(column(page, "Check-in").getByText("Target 30 min")).toBeVisible();
  const s01 = column(page, "Check-in").getByRole("link", { name: /KJA-482TX/ }).first();
  await expect(s01).toBeVisible();
  await expect(s01).toContainText("With:");
  await expect(s01).toContainText("Promised:");
  await expect(column(page, "Waiting parts").getByRole("link", { name: /LSR-516ST/ })).toBeVisible();
  // Tags: a warranty job and a repeat job from the demo data.
  await expect(columns(page).getByText("Warranty", { exact: true }).first()).toBeVisible();
  await expect(columns(page).getByText(/^Repeat/).first()).toBeVisible();
  // Timing in words, not colour alone (the demo jobs have waited hours by now).
  await expect(columns(page).getByText(/over target/).first()).toBeVisible();
  await expectCleanText(page, "board at 1440");
  await expectNoHorizontalOverflow(page, "board at 1440");
  // The columns scroll sideways inside the board only.
  const scroll = await columns(page).evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(scroll).toBeGreaterThan(0);
  await shot(page, "p10-board-1440");
  await s01.click();
  await expect(page.getByRole("heading", { name: /Step 1 of 8: Check-in/ })).toBeVisible({ timeout: 60_000 });
  await page.context().close();
});

test("B: filters live in the address bar, survive a reload, and clear", async ({ browser, request }) => {
  const api = await apiAs(request, "workshopManager");
  const page = await pageAs(browser, "workshopManager");
  await openBoard(page);
  const branchId = (await api.get<Board>("/service/job-cards/board")).branchId;
  const technicians = await api.get<{ users: { id: string; firstName: string; lastName: string }[] }>(`/service/staff?role=Technician&branchId=${branchId}`);
  const tech = technicians.users[0];
  await page.getByRole("combobox", { name: "Technician" }).click();
  await page.getByRole("option", { name: new RegExp(`${tech.firstName} ${tech.lastName}`) }).click();
  await expect(page).toHaveURL(new RegExp(`technician=${tech.id}`));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workshop board" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("combobox", { name: "Technician" })).toHaveValue(`${tech.firstName} ${tech.lastName}`);
  const filtered = await api.get<Board>(`/service/job-cards/board?technicianId=${tech.id}`);
  const shown = filtered.columns.reduce((sum, item) => sum + item.total, 0);
  if (shown === 0) await expect(page.getByText("No active jobs match these filters")).toBeVisible();
  else await expect(columns(page).getByRole("link")).toHaveCount(Math.min(shown, 8 * 50));

  // A received date with no jobs: the filtered empty state, then Clear filters.
  await page.getByLabel("Received").selectOption({ label: "Pick a date" });
  await page.getByPlaceholder(/DD\/MM\/YYYY|dd\/mm\/yyyy/i).or(page.locator("#board-received ~ div input")).first().fill("01/01/2020");
  await page.keyboard.press("Tab");
  await expect(page).toHaveURL(/date=2020-01-01/);
  await expect(page.getByText("No active jobs match these filters")).toBeVisible();
  await expectCleanText(page, "filtered empty board");
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page).not.toHaveURL(/technician=|date=/);
  await expect(page.getByRole("button", { name: "Clear filters" }).first()).toBeDisabled();
  await expect(column(page, "Check-in")).toBeVisible();
  await page.context().close();
});

test("C: the table view adds the With column and can show one column", async ({ browser }) => {
  const page = await pageAs(browser, "workshopManager");
  await openBoard(page);
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("heading", { name: "Job Cards" })).toBeVisible();
  await expect(page).toHaveURL(/view=table/);
  await expect(page.getByRole("columnheader", { name: "With" })).toBeVisible();
  await page.goto("/job-cards?view=table&column=WAITING_PARTS");
  await expect(page.getByText("Showing jobs at Waiting parts only.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: "LSR-516ST" })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "KJA-482TX" })).toHaveCount(0);
  await expectCleanText(page, "table limited to waiting parts");
  await page.getByRole("button", { name: "Show every step" }).click();
  await expect(page.getByText("Showing jobs at Waiting parts only.")).toHaveCount(0);
  await page.getByRole("button", { name: "Board" }).click();
  await expect(page.getByRole("heading", { name: "Workshop board" })).toBeVisible();
  await page.context().close();
});

test("D: a service advisor opens on the table and can switch to the board", async ({ browser }) => {
  const page = await pageAs(browser, "advisor");
  await page.goto("/job-cards");
  await expect(page.getByRole("heading", { name: "Job Cards" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Table" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Board" }).click();
  await expect(column(page, "Check-in")).toBeVisible();
  await page.context().close();
});

test("E: keyboard only: the toggle, the board region and a card", async ({ browser }) => {
  const page = await pageAs(browser, "workshopManager");
  await openBoard(page);
  await page.getByRole("button", { name: "Table" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Job Cards" })).toBeVisible();
  await page.getByRole("button", { name: "Board" }).focus();
  await page.keyboard.press("Enter");
  await columns(page).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("href", /\/job-cards\/[0-9a-f-]{36}$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Step \d of 8/ })).toBeVisible({ timeout: 60_000 });
  await page.context().close();
});

test("F: loading, offline refresh, load error with Try again, and the empty board", async ({ browser }) => {
  const page = await pageAs(browser, "workshopManager");
  await openBoard(page);
  await expect(column(page, "Check-in")).toBeVisible();
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Refresh now" }).click();
  await expect(page.getByText(/^Could not refresh the board\. It shows the jobs as at \d{2}:\d{2}\./)).toBeVisible({ timeout: 30_000 });
  await expect(column(page, "Check-in")).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/^Could not refresh the board/)).toHaveCount(0, { timeout: 30_000 });

  // The board fails to load at all: the error, then Try again loads it.
  let fail = true;
  await page.route("**/service/job-cards/board?*", (route) => (fail ? route.abort("internetdisconnected") : route.fallback()));
  await page.goto("/job-cards?view=board&advisor=6f1c2d4e-1111-4a2b-9c3d-000000000002");
  await expect(page.getByText("Could not load the workshop board")).toBeVisible({ timeout: 60_000 });
  await expectCleanText(page, "board load error");
  await shot(page, "p10-board-error");
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("No active jobs match these filters")).toBeVisible({ timeout: 30_000 });
  await page.unroute("**/service/job-cards/board?*");

  // A branch with no active jobs: the empty board with Open a job card (served empty here).
  await page.route("**/service/job-cards/board?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.columns = body.data.columns.map((item: { key: string }) => ({ ...item, total: 0, cards: [] }));
    await route.fulfill({ response, json: body });
  });
  await page.goto("/job-cards?view=board");
  await expect(page.getByText("No active jobs in the workshop")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "Open a job card" })).toHaveAttribute("href", "/job-cards/new");
  await shot(page, "p10-board-empty");
  await page.context().close();
});

test("G: a service advisor cannot open another branch's board", async ({ browser, request }) => {
  const abuja = (await (await apiAs(request, "abujaAdmin")).get<Board>("/service/job-cards/board")).branchId;
  const page = await pageAs(browser, "advisor");
  await page.goto(`/job-cards?view=board&branch=${abuja}`);
  await expect(page.getByText("You cannot see this workshop board")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Your account does not have access to .+\. Choose your own branch, or ask your administrator for access\./)).toBeVisible();
  await expectCleanText(page, "board permission denied");
  await shot(page, "p10-board-denied");
  await page.context().close();
});

test("H: phone, tablet and laptop widths", async ({ browser }) => {
  for (const width of WIDTHS) {
    const page = await pageAs(browser, "workshopManager", width === 390 ? PHONE : { width, height: 900 });
    await openBoard(page);
    await expectNoHorizontalOverflow(page, `board at ${width}`);
    if (width === 390) {
      const step = page.getByRole("combobox", { name: "Step", exact: true });
      await expect(step).toBeVisible();
      await expect(columns(page)).toBeHidden();
      await step.selectOption({ label: (await step.locator("option").filter({ hasText: /^Waiting parts/ }).textContent())!.trim() });
      await expect(page).toHaveURL(/column=WAITING_PARTS/);
      await expect(page.getByRole("link", { name: /LSR-516ST/ })).toBeVisible();
      await expectCleanText(page, "board at 390");
      // The filters fold away on a phone and keep the filter count.
      await expect(page.getByRole("combobox", { name: "Technician" })).toBeHidden();
      await page.getByRole("button", { name: "Filters" }).click();
      await expect(page.getByRole("combobox", { name: "Technician" })).toBeVisible();
      await page.getByRole("combobox", { name: "Received" }).selectOption({ label: "Today" });
      await page.getByRole("button", { name: "Hide filters" }).click();
      await expect(page.getByRole("button", { name: "Filters, 1 applied" })).toBeVisible();
      await expectNoHorizontalOverflow(page, "board at 390 with a filter");
    } else await expect(column(page, "Ready")).toBeAttached();
    await shot(page, `p10-board-${width}`);
    await page.context().close();
  }
});

test("I: the time targets are set per branch in Settings and shown on the board", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/settings/company");
  await expect(page.getByText("Workshop board time targets")).toBeVisible({ timeout: 60_000 });
  const checkIn = page.getByLabel("Check-in (minutes)");
  await expect(checkIn).toHaveValue("30");
  await checkIn.fill("45");
  await page.getByRole("button", { name: "Save branch rules" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await openBoard(page, "?view=board");
  await expect(column(page, "Check-in").getByText("Target 45 min")).toBeVisible();
  await page.goto("/settings/company");
  await page.getByLabel("Check-in (minutes)").fill("30");
  await page.getByRole("button", { name: "Save branch rules" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.context().close();
});
