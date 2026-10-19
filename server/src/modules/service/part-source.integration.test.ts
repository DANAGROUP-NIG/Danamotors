/**
 * Part source records end to end against a real database: a main (Mobis) part with used and
 * local source records, stock received through a vendor receipt, a Mobis quote declined and
 * revised to the cheaper records, the used record issued, and the job card line and bill priced
 * from the issued record. Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { InventoryService as InventoryType } from "../inventory/inventory.service";
import type { ServiceService as ServiceType } from "./service.service";
import type { VendorReceiptService as ReceiptType } from "../vendor-receipt/vendorReceipt.service";
import type { JobCardLineService as LineType } from "../job-card-line/jobCardLine.service";
import type { JobBillingService as BillingType } from "../finance/job-billing.service";

jest.mock("../notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyRole: jest.fn(),
    notifyUsers: jest.fn(),
  })),
}));

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(120_000);

describeDb("Part source records (database)", () => {
  let prisma: PrismaClient;
  let inventory: InventoryType;
  let jobs: ServiceType;
  let receipts: ReceiptType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);

  beforeAll(() => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    inventory = new (require("../inventory/inventory.service").InventoryService)();
    jobs = new (require("./service.service").ServiceService)();
    receipts = new (require("../vendor-receipt/vendorReceipt.service").VendorReceiptService)();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("quotes, issues and bills each source as its own part record with its own stock", async () => {
    const { ROLES } = require("../../shared/constants/roles");
    const branch = await prisma.branch.create({ data: { name: `part-source-${run}` } });
    const role = await prisma.role.upsert({ where: { name: ROLES.SERVICE_ADVISOR }, update: {}, create: { name: ROLES.SERVICE_ADVISOR } });
    const user = await prisma.user.create({
      data: { email: `ps.${run}@example.test`, firstName: "Test", lastName: "Advisor", passwordHash: "not-a-login", roleId: role.id, branchId: branch.id },
    });
    const customer = await prisma.customer.create({ data: { firstName: "Test", lastName: "Owner", phoneNumber: `ps${run}`, branchId: branch.id } });
    const vendor = await prisma.customer.create({ data: { firstName: "Ade", lastName: "Spares", companyName: `Ade Spares ${run}`, type: "VENDOR", branchId: branch.id } });
    const vehicle = await prisma.vehicle.create({ data: { vin: `PS${run}`, customModel: "Integration fixture", customerId: customer.id, lastRecordedMileage: 100 } });
    const bay = await prisma.workshopMaster.create({ data: { kind: "BAY", code: `B${run}`, description: "Bay" } });
    const team = await prisma.workshopMaster.create({ data: { kind: "TEAM", code: `T${run}`, description: "Team" } });
    const serviceType = await prisma.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `S${run}`, description: "Suspension check" } });
    const model = await prisma.workshopMaster.create({ data: { kind: "MODEL", code: `M${run}`, description: "Model" } });
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { catalogueId: model.id } });
    await prisma.serviceTypeModelSetting.create({ data: { serviceTypeId: serviceType.id, modelId: model.id, serviceCharge: 1000 } });

    // 1. A Mobis shock absorber (category C, 3.33x) with used and local source records.
    const main = await inventory.createPart(
      { partNumber: `54651${run}`, name: "Shock absorber", category: "Suspension", uom: "EA", unitRate: 20000, priceCategoryCode: "C" },
      user.id,
    );
    expect(main.retailRate).toBe(66600);
    await prisma.inventoryStock.create({ data: { branchId: branch.id, partId: main.id, quantity: 4 } });

    const used = await inventory.createSourceRecord(main.id, { source: "U", partNumber: `54651${run}-U`, dealerRate: 5000 }, user.id);
    expect(used).toMatchObject({ partFlag: "U", sourceOfPartId: main.id, name: "Shock absorber", uom: "EA", priceCategoryCode: "L", retailRate: 7500, warrantyApplicable: false });
    const local = await inventory.createSourceRecord(main.id, { source: "L", partNumber: `54651${run}-L`, dealerRate: 9000, priceCategoryCode: "L" }, user.id);
    await expect(inventory.createSourceRecord(main.id, { source: "U", partNumber: `54651${run}-U2`, dealerRate: 1 })).rejects.toThrow("already has a Second-hand / used record");
    await expect(inventory.createSourceRecord(main.id, { source: "O", partNumber: `54651${run}-O`, dealerRate: 1 })).rejects.toThrow("already a Mobis");
    await expect(inventory.createSourceRecord(used.id, { source: "R", partNumber: `54651${run}-R`, dealerRate: 1 })).rejects.toThrow("itself a source record");
    await expect(inventory.updatePart(main.id, { partFlag: "A" })).rejects.toThrow("has source records");
    await expect(inventory.updatePart(used.id, { partFlag: "R" })).rejects.toThrow("is a source record");
    await expect(inventory.updatePart(used.id, { warrantyApplicable: true })).rejects.toThrow("cannot be claimed under warranty");
    await expect(inventory.createAlternatePart({ mainPartId: used.id, partNumber: `54651${run}-ALT`, name: "Alt" })).rejects.toThrow("source record");
    // The database holds the same rules for any other writer.
    const raw = (partNumber: string, data: object) => prisma.sparePart.create({ data: { partNumber, name: "Raw", ...data } });
    await expect(raw(`54651${run}-X1`, { sourceOfPartId: used.id, partFlag: "R" })).rejects.toThrow("cannot have source records of its own");
    await expect(raw(`54651${run}-X2`, { sourceOfPartId: main.id, partFlag: "O" })).rejects.toThrow("different part flag");
    await expect(raw(`54651${run}-X3`, { sourceOfPartId: main.id, partFlag: "R", warrantyApplicable: true })).rejects.toThrow("SparePart_source_record_check");

    // 2. Stock for the source records comes in on a vendor receipt; cost sets the dealer rate, retail follows category L.
    const receipt = await receipts.createReceipt(
      {
        receivingBranchId: branch.id,
        vendorId: vendor.id,
        invoiceNumber: `INV-${run}`,
        invoiceDate: new Date(),
        lines: [
          { partId: used.id, quantity: 3, unitCost: 6000 },
          { partId: local.id, quantity: 2, unitCost: 9000 },
        ],
      },
      user.id,
    );
    expect(receipt).toMatchObject({ source: "VENDOR", vendor: `Ade Spares ${run}`, vendorId: vendor.id, totalReceived: 5, totalValue: 36000 });
    expect(receipt.lines.map((l) => [l.part.partNumber, l.sourceLabel, l.unitCost])).toEqual([
      [`54651${run}-L`, "Local purchase", 9000],
      [`54651${run}-U`, "Second-hand / used", 6000],
    ]);
    const usedAfter = await prisma.sparePart.findUniqueOrThrow({ where: { id: used.id } });
    expect([usedAfter.unitPrice, usedAfter.retailRate]).toEqual([6000, 9000]);
    const history = await prisma.partRateHistory.findMany({ where: { partId: used.id }, orderBy: { changedAt: "asc" } });
    expect(history.at(-1)).toMatchObject({ oldDealerRate: 5000, newDealerRate: 6000, oldRetailRate: 7500, newRetailRate: 9000 });
    const txns = await prisma.stockTransaction.findMany({ where: { referenceId: receipt.id } });
    expect(txns.map((t) => [t.type, t.quantity]).sort()).toEqual([["RECEIVED", 2], ["RECEIVED", 3]]);
    await expect(
      receipts.createReceipt({ receivingBranchId: branch.id, vendorId: vendor.id, invoiceNumber: `inv-${run}`, invoiceDate: new Date(), lines: [{ partId: used.id, quantity: 1, unitCost: 1 }] }, user.id),
    ).rejects.toThrow("already received");
    await expect(
      receipts.createReceipt({ receivingBranchId: branch.id, vendorId: customer.id, invoiceNumber: "X", invoiceDate: new Date(), lines: [{ partId: used.id, quantity: 1, unitCost: 1 }] }, user.id),
    ).rejects.toThrow("Choose a vendor");

    const sources = await inventory.listPartSources(used.id, branch.id);
    expect(sources.mainPartId).toBe(main.id);
    expect(sources.records.map((r) => [r.partFlag, r.retailRate, r.stock?.quantity])).toEqual([
      ["O", 66600, 4],
      ["L", 13500, 2],
      ["U", 9000, 3],
    ]);
    expect((await inventory.getReplacementOptions(main.id, branch.id)).map((p) => p.id)).toEqual([]);

    // 3. All-Mobis quote, declined; the revision fits one used and one local shock instead.
    const job = await jobs.createJobCard({
      customerId: customer.id,
      vehicleId: vehicle.id,
      branchName: branch.name,
      serviceTypeId: serviceType.id,
      bayId: bay.id,
      teamId: team.id,
      promisedAt: new Date(Date.now() + 3600000).toISOString(),
      description: "Knocking from the rear",
      serviceAdvisorId: user.id,
      mileage: 150,
      complaints: [{ description: "Knocking from the rear" }],
      createdById: user.id,
    });
    const service = { type: "SERVICE" as const, referenceId: serviceType.id, quantity: 1 };
    const part = (referenceId: string, quantity = 1) => ({ type: "PART" as const, referenceId, quantity });
    await expect(jobs.addEstimate(job.id, { description: "Quote", lines: [service, part(main.id), part(main.id)] })).rejects.toThrow("only once per estimate");

    const mobis = await jobs.addEstimate(job.id, { description: "Quote", lines: [service, part(main.id, 2)] });
    expect(mobis.lines.find((l) => l.type === "PART")).toMatchObject({ referenceId: main.id, partSource: "O", rate: 66600, amount: 133200 });
    await jobs.addApproval(mobis.id, { customerId: customer.id, approved: false });

    const revised = await jobs.addEstimate(job.id, { description: "Revised quote", lines: [service, part(used.id), part(local.id)] });
    const partLines = revised.lines.filter((l) => l.type === "PART");
    expect(partLines.map((l) => [l.referenceId, l.partSource, l.rate])).toEqual([
      [used.id, "U", 9000],
      [local.id, "L", 13500],
    ]);
    await jobs.addApproval(revised.id, { customerId: customer.id, approved: true });

    // 4. Issue the used record: its stock drops, the Mobis part's does not; the Mobis part is not approved.
    const issue = (sparePartId: string, quantity = 1) =>
      inventory.createPartIssuance({ branchId: branch.id, sparePartId, jobCardId: job.id, issuedById: user.id, quantity });
    await expect(issue(main.id)).rejects.toThrow("Not in approved scope");
    const issued = await issue(used.id);
    expect(issued).toMatchObject({ sparePartId: used.id, partSource: "U" });
    await expect(issue(used.id)).rejects.toThrow("Quantity / hours exceed approval");
    const stockOf = async (partId: string) =>
      (await prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branch.id, partId } } })).quantity;
    expect(await stockOf(used.id)).toBe(2);
    expect(await stockOf(main.id)).toBe(4);

    // 5. The job card line and the bill charge the used record's own retail rate.
    const lines: LineType = new (require("../job-card-line/jobCardLine.service").JobCardLineService)();
    const { lines: cardLines } = await lines.list(job.id);
    expect(cardLines.filter((l) => l.kind === "PART").map((l) => [l.sparePartId, l.partSource, l.rate])).toEqual([[used.id, "U", 9000]]);
    const billing: BillingType = new (require("../finance/job-billing.service").JobBillingService)();
    const card = await billing["loadJobCard"](job.id);
    const priced = billing["pricedScope"](card);
    expect(priced.lines.filter((l) => l.type === "PART").map((l) => [l.referenceId, "partSource" in l ? l.partSource : null, l.rate, l.amount])).toEqual([
      [used.id, "U", 9000, 9000],
    ]);
  });
});
