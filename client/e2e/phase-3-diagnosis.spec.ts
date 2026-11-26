import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/accounts";
import { apiAs, expectCleanText, expectNoHorizontalOverflow, jobIdByPlate, pageAs, shot } from "./support/helpers";

/**
 * Phase 3: diagnosis (supervisor assigns, technician records findings, service engineer confirms or
 * returns), following doc/testing/jobcard-revamp/phase-3-manual-test.md. Runs in order on a fresh
 * copy of the demo data.
 *   LSR-512ST (JC-S02): waiting for a technician.   LSR-513ST (JC-S03): with Tunde Akinyemi, nothing recorded.
 *   LSR-524ST (JC-S13): with the engineer, one finding flagged possible warranty.
 *   LSR-525ST (JC-S14): returned by the engineer.   LSR-526ST (JC-S15): with the engineer, nothing warranty related.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("workshopManager") });

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

const bar = (page: Page) => page.getByRole("region", { name: "Step actions" });
const open = async (page: Page, id: string) => {
  await page.goto(`/job-cards/${id}`);
  await expect(page.getByRole("heading", { name: "Step 2 of 8: Diagnosis" })).toBeVisible({ timeout: 30_000 });
};

/** Adds work or a part through the search dialog. */
async function pick(page: Page, button: "Add work" | "Add part", search: string, choose: RegExp) {
  await page.getByRole("button", { name: button }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill(search);
  await dialog.getByRole("button", { name: choose }).first().click();
  await expect(dialog).toBeHidden();
}

test("A: the workshop supervisor sees requests and technicians, is told to choose, and assigns technician and bay", async ({ page, request }) => {
  const id = await jobIdByPlate(request, "LSR-512ST");
  await open(page, id);
  await expect(page.getByText("Waiting for a technician to be assigned")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What the customer asked for" })).toBeVisible();
  await expect(page.getByText("Engine warning light on", { exact: true })).toBeVisible();
  const group = page.getByRole("radiogroup", { name: /Technician/ });
  await expect(group.getByText("Tunde Akinyemi")).toBeVisible();
  await expect(group.getByText("Kingsley Okoro")).toBeVisible();
  await expect(group.getByText(/^(Available|Busy)$/).first()).toBeVisible();
  // Only this branch's technicians: the Abuja technician is not offered.
  await expect(group.getByText("Usman Garba")).toHaveCount(0);
  await expectCleanText(page, "allocation");
  await shot(page, "p3-allocation-1440");
  // The alert's link takes the supervisor to the technician list.
  await page.getByRole("link", { name: "Assign a technician" }).click();
  await expect(page.getByRole("heading", { name: "Assign technician" })).toBeInViewport();

  await bar(page).getByRole("button", { name: "Assign technician" }).click();
  await expect(page.getByText("Choose a technician from the list.")).toBeVisible();

  // Keyboard: arrows move between technicians.
  await group.getByRole("radio").first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio").nth(1)).toBeChecked();

  await group.getByText("Tunde Akinyemi").click();
  const bay = page.getByLabel(/^Bay/);
  // Each bay says free or which job occupies it; choose the first free one.
  const free = (await bay.locator("option").allInnerTexts()).find((label) => / \(free\)$/.test(label));
  expect(free, "a free bay").toBeTruthy();
  expect((await bay.locator("option").allInnerTexts()).every((label) => /\((free|occupied by job \d+)\)$|^Choose a bay$/.test(label))).toBe(true);
  await bay.selectOption({ label: free! });
  await page.getByLabel("Note to technician (optional)").fill("Customer is waiting in the lounge.");
  await bar(page).getByRole("button", { name: "Assign and send to Tunde Akinyemi" }).click();
  await expect(page.getByText(/sent to Tunde Akinyemi/).first()).toBeVisible();
  await expect(page.getByText(/With: Tunde Akinyemi \(Technician\)/)).toBeVisible();
  await expect(page.getByText("Technician assigned:")).toBeVisible();
  // The supervisor sees the findings read-only and can still change the technician.
  await expect(page.getByRole("button", { name: "Change technician or bay" })).toBeVisible();
});

test("B: the technician records findings on a phone, with no prices, and they survive a reload", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-512ST");
  const page = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(page, id);
  await expect(page.getByText("Note from the workshop supervisor")).toBeVisible();
  await expect(page.getByText("Customer is waiting in the lounge.")).toBeVisible();
  const send = bar(page).getByRole("button", { name: "Send to service engineer" });
  await expect(send).toBeDisabled();
  await expect(bar(page).getByText("Write what you found for the customer request.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("₦");

  await page.getByLabel(/What did you find\?/).first().fill("Engine misfire on cylinder 2. Ignition coil failed.");
  await pick(page, "Add work", "ignition", /Replace ignition coil/);
  await pick(page, "Add part", "ignition coil", /Ignition coil assembly/);
  await page.getByRole("button", { name: /^More: Ignition coil/ }).click();
  await expect(page.getByLabel("Qty").first()).toHaveValue("2");
  await page.getByRole("switch", { name: "Possible warranty" }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "coil.png", mimeType: "image/png", buffer: png() });
  await expect(page.getByText("Photo added")).toBeVisible();
  await expect(page.getByText(/^Saved \d{2}:\d{2}$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Add a finding the customer did not mention" }).click();
  await page.getByLabel(/What did you find\?/).last().fill("Rear wiper blade torn.");
  await expect(page.getByText(/^Saved \d{2}:\d{2}$/).last()).toBeVisible();
  await expect(send).toBeEnabled();
  await expectNoHorizontalOverflow(page, "findings at 390");
  await expectCleanText(page, "findings");
  await shot(page, "p3-findings-390");

  await page.reload();
  await expect(page.getByLabel(/What did you find\?/).first()).toHaveValue("Engine misfire on cylinder 2. Ignition coil failed.");
  await expect(page.getByText("Rear wiper blade torn.")).toHaveCount(1);
  await expect(page.getByText("Photos (1)")).toBeVisible();

  await send.click();
  await expect(page.getByText(/sent to/).first()).toBeVisible();
  await expect(page.getByText(/With: Service engineer since/)).toBeVisible();
  // Now read-only for the technician.
  await expect(page.getByText(/Waiting for the service engineer/)).toBeVisible();
  await expect(page.getByLabel(/What did you find\?/)).toHaveCount(0);
  await page.context().close();
});

test("C: another technician and the service advisor see someone else's step read-only", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-513ST");
  const other = await pageAs(browser, "otherTechnician");
  await open(other, id);
  await expect(other.getByText(/Waiting for Tunde Akinyemi \(Technician\)/)).toBeVisible();
  await expect(other.getByLabel(/What did you find\?/)).toHaveCount(0);
  await expect(bar(other).getByRole("button", { name: "Send to service engineer" })).toHaveCount(0);
  await shot(other, "p3-other-technician-readonly");
  await other.context().close();

  const advisor = await pageAs(browser, "advisor");
  const waiting = await jobIdByPlate(request, "LSR-524ST");
  await open(advisor, waiting);
  await expect(advisor.getByText(/Waiting for the service engineer/)).toBeVisible();
  await expect(advisor.getByRole("button", { name: /Edit the finding/ })).toHaveCount(0);
  await advisor.context().close();

  // The server refuses another technician's change even if the screen were bypassed.
  const api = await apiAs(request, "otherTechnician");
  const response = await api.put(`/service/job-cards/${id}/diagnosis/findings/${crypto.randomUUID()}`, {
    complaintId: null, causeAndDefect: "Not mine", possibleWarranty: false, items: [], expectedVersion: 0,
  });
  expect(response.status()).toBe(403);
});

test("D: the engineer reviews, must write a note to return, and the technician sees it", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-512ST");
  const page = await pageAs(browser, "engineer");
  await open(page, id);
  await expect(page.getByText("Service engineer is reviewing the findings")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnosis by Tunde Akinyemi" })).toBeVisible();
  await expect(page.getByText("Possible warranty", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 finding is flagged as possible warranty.")).toBeVisible();
  await expect(page.getByText("This job goes to the warranty officer next.")).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "Confirm and send to warranty officer" })).toBeEnabled();
  await expectCleanText(page, "engineer review");
  await shot(page, "p3-engineer-review-1440");

  await bar(page).getByRole("button", { name: "Return to technician" }).click();
  const dialog = page.getByRole("dialog", { name: "Return to technician" });
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(dialog.getByText("Write what the technician should check again.")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Note to the technician/).fill("Check the spark plug on cylinder 2 as well.");
  await dialog.getByRole("button", { name: "Return to technician" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/With: Tunde Akinyemi \(Technician\)/)).toBeVisible();
  await page.context().close();

  const technician = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(technician, id);
  await expect(technician.getByText(/^Returned by Bola Adewale, /)).toBeVisible();
  await expect(technician.getByText("Check the spark plug on cylinder 2 as well.")).toBeVisible();
  const notices = await (await apiAs(request, "technician")).get<{ notifications: { title: string; message: string }[] }>("/notifications?limit=10");
  expect(notices.notifications.some((row) => row.title === "Job returned to you" && row.message.includes("Check the spark plug"))).toBe(true);
  await technician.getByLabel(/What did you find\?/).first().fill("Engine misfire on cylinder 2. Ignition coil failed. Spark plug worn.");
  await expect(technician.getByText(/^Saved \d{2}:\d{2}$/).first()).toBeVisible();
  await bar(technician).getByRole("button", { name: "Send to service engineer" }).click();
  await expect(technician.getByText(/Waiting for the service engineer/)).toBeVisible();
  await technician.context().close();

  const engineer = await pageAs(browser, "engineer");
  await open(engineer, id);
  await bar(engineer).getByRole("button", { name: "Confirm and send to warranty officer" }).click();
  await expect(engineer.getByRole("heading", { name: "Step 3 of 8: Warranty" })).toBeVisible();
  await expect(engineer.getByText(/Diagnosis completed by Bola Adewale/)).toBeVisible();
  await engineer.context().close();
});

test("E: nothing warranty related goes straight to the advisor and the warranty step shows as skipped", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-526ST");
  const page = await pageAs(browser, "engineer");
  await open(page, id);
  await expect(page.getByText(/is not under warranty, has no open campaign and no finding is flagged/)).toBeVisible();
  // The engineer corrects a finding in the edit dialog.
  await page.getByRole("button", { name: "Edit the finding for request 1" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit finding" });
  await dialog.getByLabel(/Finding \(cause and nature of defect\)/).fill("Due for the 100,000 km service. Front tyres near the wear limit.");
  await dialog.getByRole("button", { name: "Save and close" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("cell", { name: /Front tyres near the wear limit\./ })).toBeVisible();
  await bar(page).getByRole("button", { name: "Confirm and send to service advisor" }).click();
  await expect(page.getByRole("heading", { name: "Step 4 of 8: Estimate" })).toBeVisible();
  await expect(page.getByText("Warranty skipped. Not under warranty.")).toBeVisible();
  await shot(page, "p3-warranty-skipped");
  await page.context().close();
});

test("F: offline, a finding is kept on screen as Not saved and Retry saves it", async ({ browser, request }) => {
  const id = await jobIdByPlate(request, "LSR-525ST");
  const page = await pageAs(browser, "technician", { width: 390, height: 844 });
  await open(page, id);
  await expect(page.getByText("Check the wheel alignment readings and the front suspension bushes before we quote.")).toBeVisible();
  await page.context().setOffline(true);
  await page.getByLabel(/What did you find\?/).first().fill("Front tyres worn unevenly. Alignment out by 2 degrees.");
  await expect(page.getByText(/^Not saved\./).first()).toBeVisible({ timeout: 10_000 });
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Retry" }).first().click();
  await expect(page.getByText(/^Saved \d{2}:\d{2}$/).first()).toBeVisible();
  await expect(page.getByLabel(/What did you find\?/).first()).toHaveValue("Front tyres worn unevenly. Alignment out by 2 degrees.");
  await shot(page, "p3-returned-banner-390");
  await page.context().close();
});

test("G: every diagnosis screen fits phone and tablet widths without sideways scrolling", async ({ browser, request }) => {
  const cases = [
    ["workshopManager", "LSR-513ST"],
    ["technician", "LSR-513ST"],
    ["engineer", "LSR-524ST"],
  ] as const;
  for (const [role, plate] of cases)
    for (const width of [1024, 768, 390]) {
      const page = await pageAs(browser, role, { width, height: 900 });
      await open(page, await jobIdByPlate(request, plate));
      await expectNoHorizontalOverflow(page, `${role} ${plate} at ${width}`);
      await expectCleanText(page, `${role} ${plate} at ${width}`);
      if (width === 390) await shot(page, `p3-${role}-390`);
      await page.context().close();
    }
});
