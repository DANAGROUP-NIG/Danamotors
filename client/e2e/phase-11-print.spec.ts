import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 11: the printed job card and gate pass, following doc/testing/jobcard-revamp/phase-11-manual-test.md.
 *   LSR-548ST (JC-S37): delivered; customer Ọlá Ògúnlẹ̀yẹ̀; nine long requests; two earlier visits.
 *   LSR-547ST (JC-S36): delivered; two requests (the front fits one sheet).
 *   LSR-544ST (JC-S33): waiting at Delivery, so no gate pass yet.
 */
test.describe.configure({ mode: "serial" });

const PHONE = { width: 390, height: 844 };
const OUT = "e2e/.results/screens";

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

/** The dev server sometimes answers 404 while it first compiles a page; one reload fixes that. */
async function open(page: Page, url: string, ready: (page: Page) => ReturnType<Page["getByRole"]>) {
  await page.goto(url);
  const target = ready(page);
  const notFound = page.getByText("PAGE NOT FOUND", { exact: true }).or(page.getByText("Page not found", { exact: true }));
  await expect(target.or(notFound).first()).toBeVisible({ timeout: 60_000 });
  if (await notFound.isVisible()) await page.reload();
  await expect(target.first()).toBeVisible({ timeout: 60_000 });
}

/** Pages in a PDF Chromium wrote: one "/Type /Page" object per sheet. */
const pdfPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;

/** The printed result: print media at the sheet's width, saved as a picture and as the PDF the browser would make. */
async function printPreview(page: Page, name: string, format: "A4" | "A6") {
  await page.emulateMedia({ media: "print" });
  // The printable width: A4 is 190 mm between the margins, A6 93 mm.
  await page.setViewportSize(format === "A4" ? { width: 718, height: 1047 } : { width: 352, height: 514 });
  await page.screenshot({ path: `${OUT}/${name}-print.png`, fullPage: true });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(`${OUT}/${name}.pdf`, pdf);
  await page.emulateMedia({ media: "screen" });
  return pdf;
}

test("A: the advisor prints a delivered job card from the Print menu; both sheets match the paper form", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-548ST");
  const page = await pageAs(browser, "advisor");
  await countPrints(page);
  await open(page, `/job-cards/${id}`, (p) => p.getByRole("heading", { name: "Closed job" }));
  await page.getByRole("button", { name: "Print", exact: true }).click();
  for (const label of ["Print job card", "Print gate pass", "Print estimate"]) await expect(page.getByRole("menuitem", { name: label })).toBeVisible();
  await page.getByRole("menuitem", { name: "Print job card" }).click();
  await expect(page).toHaveURL(new RegExp(`/job-cards/${id}/print$`));
  await expect(page.getByRole("heading", { name: "Job card", exact: true })).toBeVisible({ timeout: 60_000 });
  // Opened from the menu (not ?print=1): no print dialog until the button is pressed.
  expect(await printed(page)).toBe(0);

  const front = page.getByRole("article", { name: "Job card, front" });
  await expect(front.getByRole("img", { name: "Warranty, not ticked" })).toBeVisible();
  await expect(front.getByRole("img", { name: "Non-warranty, ticked" })).toBeVisible();
  for (const title of ["Customer details", "Vehicle details", "Customer requests", "Instructions to technician", "Body and paint damage", "Fuel level", "Service checklist", "Cause and nature of defect", "Estimated and actual", "Vehicle history"])
    await expect(front.getByRole("region", { name: title, exact: true })).toBeVisible();
  await expect(front.getByText("Ọlá Ògúnlẹ̀yẹ̀").first()).toBeVisible();
  await expect(front.getByText("50,240 km")).toBeVisible();
  await expect(front.getByRole("region", { name: "Customer requests", exact: true }).getByRole("listitem")).toHaveCount(9);
  await expect(front.getByRole("img", { name: "Fuel level: Half (1/2)" })).toBeVisible();
  await expect(front.getByRole("region", { name: "Service checklist", exact: true }).getByRole("listitem")).toHaveCount(25);
  await expect(front.getByText("Missing", { exact: true })).toBeVisible();
  await expect(front.getByText("Not working", { exact: true })).toBeVisible();
  const table = front.getByRole("region", { name: "Estimated and actual", exact: true });
  await expect(table.getByRole("row", { name: /^Total ₦[\d,]+\.\d{2} ₦[\d,]+\.\d{2}$/ })).toBeVisible();
  await expect(table.getByRole("row", { name: /^Delivery date \d{1,2} \w{3} 2026 \d{1,2} \w{3} 2026$/ })).toBeVisible();
  for (const box of ["Service advisor", "Technician", "Service manager", "Customer authorisation", "Customer delivery"])
    await expect(front.getByRole("region", { name: `${box} signature` })).toBeVisible();
  await expect(front.getByRole("img", { name: "Customer delivery signature" })).toBeVisible();
  await expect(front.getByText(/^Last visit:$/)).toBeVisible();
  await expect(front.getByText(/^\d{1,2} \w{3} 2026, job \d+, 40,060 km, Periodic service \(40,000 km\), Brake check$/)).toBeVisible();
  const back = page.getByRole("article", { name: "Job card, back" });
  await expect(back.getByRole("heading", { name: "Terms and conditions" })).toBeVisible();
  await expect(back.getByRole("listitem")).toHaveCount(12);

  await expectCleanText(page, "Printed job card");
  await shot(page, "p11-job-card-1440");
  await page.getByRole("button", { name: "Print job card" }).click();
  await expect.poll(() => printed(page)).toBe(1);

  // Nine long requests: the front runs onto a second sheet, the terms start on their own sheet.
  const pdf = await printPreview(page, "p11-job-card-long", "A4");
  expect(pdfPages(pdf)).toBeGreaterThanOrEqual(3);
});

test("B: a short job prints on two sheets, front and back; the phone and tablet show it without sideways scrolling", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-547ST");
  const page = await pageAs(browser, "advisor");
  await open(page, `/job-cards/${id}/print`, (p) => p.getByRole("heading", { name: "Job card", exact: true }));
  const pdf = await printPreview(page, "p11-job-card-short", "A4");
  expect(pdfPages(pdf)).toBe(2);
  expect(pdf.toString("latin1")).toMatch(/\/MediaBox\s*\[\s*0 0 59[45]\.\d+ 84[12]\.\d+/);
  for (const [viewport, name] of [[PHONE, "390"], [{ width: 768, height: 1024 }, "768"]] as const) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("article", { name: "Job card, front" })).toBeVisible();
    await expectNoHorizontalOverflow(page, `Printed job card at ${name} px`);
    await shot(page, `p11-job-card-${name}`);
  }
});

test("C: the gate pass prints on its own A6 slip from the Documents tab and after delivery", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-548ST");
  const page = await pageAs(browser, "advisor");
  await countPrints(page);
  await open(page, `/job-cards/${id}`, (p) => p.getByRole("heading", { name: "Closed job" }));
  await page.getByRole("button", { name: "Job file" }).click();
  await page.getByRole("tab", { name: "Documents and prints" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Print job card" })).toBeVisible();
  await dialog.getByRole("link", { name: "Print gate pass" }).click();
  await expect(page.getByRole("heading", { name: "Gate pass", exact: true })).toBeVisible({ timeout: 60_000 });
  const slip = page.getByRole("article", { name: "Gate pass" });
  for (const label of ["Job number", "Gate pass number", "Registration (plate)", "Model", "Customer", "Collected by", "Delivered by", "Date and time"])
    await expect(slip.getByRole("rowheader", { name: label, exact: true })).toBeVisible();
  await expect(slip.getByRole("row", { name: "Registration (plate) LSR-548ST" })).toBeVisible();
  await expect(slip.getByRole("row", { name: "Customer Ọlá Ògúnlẹ̀yẹ̀" })).toBeVisible();
  await expect(slip.getByRole("row", { name: /^Date and time \d{1,2} \w{3} 2026, \d{2}:\d{2}$/ })).toBeVisible();
  await expect(slip.getByText("Security signature:")).toBeVisible();
  await expectCleanText(page, "Gate pass");
  await shot(page, "p11-gate-pass-1440");
  const pdf = await printPreview(page, "p11-gate-pass", "A6");
  expect(pdfPages(pdf)).toBe(1);
  // A6 is 105 by 148 mm: 297.6 by 419.5 points.
  const [, width, height] = /\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/.exec(pdf.toString("latin1")) ?? [];
  expect(Math.round(Number(width))).toBe(298);
  expect(Math.round(Number(height))).toBe(420);

  // Keyboard: the Print menu opens with Enter and Tab reaches Print gate pass.
  await open(page, `/job-cards/${id}`, (p) => p.getByRole("heading", { name: "Closed job" }));
  await page.getByRole("button", { name: "Print", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Print job card" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Print gate pass" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Gate pass", exact: true })).toBeVisible({ timeout: 30_000 });

  // The delivered summary's button opens the slip with the print dialog.
  await open(page, `/job-cards/${id}`, (p) => p.getByRole("heading", { name: "Closed job" }));
  await page.getByRole("link", { name: "Print gate pass" }).click();
  await expect(page).toHaveURL(new RegExp(`/job-cards/${id}/gate-pass/print\\?print=1$`));
  await expect.poll(() => printed(page)).toBe(1);
  await page.setViewportSize(PHONE);
  await expectNoHorizontalOverflow(page, "Gate pass at 390 px");
  await shot(page, "p11-gate-pass-390");
});

test("D: who may print, a job not delivered yet, and a lost connection", async ({ browser, request }) => {
  const delivered = await jobIdByPlate(request, "LSR-548ST");
  const waiting = await jobIdByPlate(request, "LSR-544ST");

  // A technician can print the gate pass but not the job card, which carries the customer's signatures.
  const tech = await pageAs(browser, "technician");
  await open(tech, `/job-cards/${delivered}`, (p) => p.getByRole("heading", { name: "Closed job" }));
  await tech.getByRole("button", { name: "Print", exact: true }).click();
  await expect(tech.getByRole("menuitem", { name: "Print gate pass" })).toBeVisible();
  await expect(tech.getByRole("menuitem", { name: "Print job card" })).toHaveCount(0);
  await tech.keyboard.press("Escape");
  await open(tech, `/job-cards/${delivered}/print`, (p) => p.getByRole("heading", { name: "You cannot print this job card" }));
  await expect(tech.getByText("Printing the job card needs the estimate print permission. Service advisors, service managers and workshop supervisors can print it.")).toBeVisible();
  await expect(tech.getByRole("button", { name: "Print job card" })).toHaveCount(0);
  await shot(tech, "p11-denied-1440");

  // Not delivered: no gate pass in the menu, and the slip page says why.
  const advisor = await pageAs(browser, "advisor");
  await open(advisor, `/job-cards/${waiting}`, (p) => p.getByRole("heading", { name: "Step 8 of 8: Delivery" }));
  await advisor.getByRole("button", { name: "Print", exact: true }).click();
  await expect(advisor.getByRole("menuitem", { name: "Print job card" })).toBeVisible();
  await expect(advisor.getByRole("menuitem", { name: "Print gate pass" })).toHaveCount(0);
  await advisor.keyboard.press("Escape");
  await open(advisor, `/job-cards/${waiting}/gate-pass/print`, (p) => p.getByRole("heading", { name: "The gate pass is not available yet" }));
  await expect(advisor.getByText("The gate pass is issued when the vehicle is delivered. Complete the Delivery step first.")).toBeVisible();
  await shot(advisor, "p11-gate-pass-not-issued");

  // A job card still in progress prints with blank signature lines and the shared fallback.
  await open(advisor, `/job-cards/${waiting}/print`, (p) => p.getByRole("heading", { name: "Job card", exact: true }));
  await expect(advisor.getByRole("region", { name: "Customer delivery signature" }).getByLabel("Date not recorded")).toBeVisible();
  await expectCleanText(advisor, "Printed job card before delivery");

  // Offline: the error with Try again; back online, Try again loads it.
  await advisor.route("**/api/service/job-cards/*/print", (route) => route.abort("internetdisconnected"));
  await advisor.reload();
  await expect(advisor.getByRole("heading", { name: "Could not load the job card" })).toBeVisible({ timeout: 60_000 });
  await shot(advisor, "p11-error-1440");
  await advisor.unroute("**/api/service/job-cards/*/print");
  await advisor.getByRole("button", { name: "Try again" }).click();
  await expect(advisor.getByRole("heading", { name: "Job card", exact: true })).toBeVisible({ timeout: 30_000 });

  // Keyboard: Back to job card, then Tab to Print job card, and Enter prints.
  await advisor.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => {
      (window as unknown as { printed: number }).printed += 1;
    };
  });
  await advisor.getByRole("link", { name: "Back to job card" }).focus();
  await advisor.keyboard.press("Tab");
  await expect(advisor.getByRole("button", { name: "Print job card" })).toBeFocused();
  await advisor.keyboard.press("Enter");
  await expect.poll(() => printed(advisor)).toBe(1);
});
