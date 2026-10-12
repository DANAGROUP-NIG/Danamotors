/**
 * Physical stock taking against a real database: annual batch (stock frozen) -> count sheet ->
 * upload -> complete -> S/E confirmation (stock adjusted) -> bin update -> report. Then a stock audit
 * of parts held by a perpetual count: counted blind, completed, reported, never adjusted.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";
import type { StockTakeService as ServiceType } from "./stockTake.service";
import type { InventoryService as InventoryType } from "../inventory/inventory.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb("Physical stock taking (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceType;
  let inventory: InventoryType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  let branch: { id: string };
  let user: { id: string };
  const parts: Record<string, { id: string; partNumber: string }> = {};
  let takeId = "";

  const stockOf = async (key: string) =>
    (await prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branch.id, partId: parts[key].id } } })).quantity;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("./stockTake.service").StockTakeService)();
    inventory = new (require("../inventory/inventory.service").InventoryService)();
    const role = await prisma.role.upsert({ where: { name: "GeneralStoreManager" }, update: {}, create: { name: "GeneralStoreManager" } });
    branch = await prisma.branch.create({ data: { name: `PST Branch ${run}` } });
    user = await prisma.user.create({
      data: { email: `pst.${run}@test.local`, passwordHash: "x", firstName: "Store", lastName: "Checker", roleId: role.id, branchId: branch.id },
    });
    // Stock taken from the legacy 2024 annual count (AutoEnhancer PSTDocNo 2024000001).
    const seed = [
      { key: "mirror", number: `1864421058N-${run}`, rate: 2829.09, stock: 57 },
      { key: "seal", number: `263203A001-${run}`, rate: 0, stock: 0 },
      { key: "lamp", number: `1881408062-${run}`, rate: 6746.21, stock: 4 },
      { key: "bolt", number: `1244106207B-${run}`, rate: 301.31, stock: 5 },
      { key: "disc", number: `3M-DISC-${run}`, rate: 700, stock: 3 },
    ];
    for (const p of seed) {
      parts[p.key] = await prisma.sparePart.create({ data: { partCode: p.number, partNumber: p.number, name: p.key.toUpperCase(), unitPrice: p.rate } });
      await prisma.inventoryStock.create({ data: { branchId: branch.id, partId: parts[p.key].id, quantity: p.stock } });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates an annual batch of every part at the branch and freezes their stock", async () => {
    const { stockTake, skipped } = await service.createStockTake({ branchId: branch.id, type: "ANNUAL", selection: {} }, user.id);
    takeId = stockTake.id;
    expect(skipped).toBe(0);
    expect(stockTake.summary).toMatchObject({ lines: 5, counted: 0, uncounted: 5 });

    await expect(
      inventory.adjustStock({ branchId: branch.id, partId: parts.bolt.id, quantity: 1, type: "ADJUSTMENT", recordedById: user.id }),
    ).rejects.toThrow(/under annual stock taking \(batch \d{10}\)/);
    await expect(service.createStockTake({ branchId: branch.id, type: "ANNUAL", selection: {} }, user.id)).rejects.toThrow("still open");
    await expect(service.createStockTake({ branchId: branch.id, type: "PERPETUAL", selection: {} }, user.id)).rejects.toThrow(
      "already in an open stock taking",
    );
  });

  it("issues a count sheet and merges the counts uploaded for it", async () => {
    const sheet = await service.createSheet(takeId, { checkerId: user.id }, user.id);
    expect(sheet.lineCount).toBe(5);

    const take = await service.uploadSheet(
      takeId,
      sheet.id,
      {
        uncounted: "RELEASE",
        entries: [
          { partNumber: parts.mirror.partNumber.toLowerCase(), binLocation: "N-3D3", quantity: 10 },
          { partId: parts.mirror.id, binLocation: "QSB", quantity: 8 },
          { partId: parts.seal.id, binLocation: "N-3A5", quantity: 30 },
          { partId: parts.lamp.id, binLocation: "QSB", quantity: 0, damagedQuantity: 17, remarks: "Water damage" },
          { partId: parts.bolt.id, binLocation: "N-3C4", quantity: 4 },
          { partNumber: `NOT-IN-MASTER-${run}`, binLocation: "N-9Z9", quantity: 2 },
        ],
      },
      user.id,
    );
    expect(take.summary).toMatchObject({ lines: 6, counted: 4, uncounted: 1, unknown: 1, onOpenSheets: 0 });

    const mirror = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, partId: parts.mirror.id } });
    expect(mirror).toMatchObject({ countedQuantity: 18, countedBins: "N-3D3/QSB", stockAtCount: 57 });
    // The disc was left blank and released for another sheet.
    const disc = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, partId: parts.disc.id } });
    expect(disc).toMatchObject({ countedQuantity: null, sheetId: null });
  });

  it("logs corrections and refuses to complete with unresolved part numbers or uncounted parts", async () => {
    const bolt = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, partId: parts.bolt.id } });
    await service.correctLine(takeId, bolt.id, { countedQuantity: 5, damagedQuantity: 0, remarks: "Recounted" }, user.id);
    const counts = await prisma.stockTakeCount.findMany({ where: { lineId: bolt.id }, orderBy: { countedAt: "asc" } });
    expect(counts.map((c) => [c.quantity, c.correction])).toEqual([
      [4, false],
      [1, true],
    ]);

    await expect(service.completeStockTake(takeId, {}, user.id)).rejects.toThrow("not in Part Master");
    const unknown = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, partId: null } });
    await service.setNotRequired(takeId, unknown.id, true);
    await expect(service.completeStockTake(takeId, {}, user.id)).rejects.toThrow("1 part(s) have not been counted");

    const done = await service.completeStockTake(takeId, { uncounted: "ZERO" }, user.id);
    expect(done.status).toBe("COMPLETED");
    // Taken as none on hand now, in UTC like every other timestamp.
    const disc = await prisma.stockTakeLine.findFirstOrThrow({ where: { stockTakeId: takeId, partId: parts.disc.id } });
    expect(disc.countedQuantity).toBe(0);
    expect(Math.abs(disc.countedAt!.getTime() - Date.now())).toBeLessThan(60_000);
    expect(done.summary).toMatchObject({
      counted: 5,
      uncounted: 0,
      discrepancies: 4,
      excessQuantity: 43,
      excessValue: 87700.73,
      shortageQuantity: 42,
      shortageValue: 112434.51,
    });
  });

  it("lifts the freeze on completion; stock that moves before confirmation stays", async () => {
    await inventory.adjustStock({ branchId: branch.id, partId: parts.bolt.id, quantity: 1, type: "ADJUSTMENT", recordedById: user.id });
    expect(await stockOf("bolt")).toBe(6);
  });

  it("posts each shortage and excess as a stock adjustment on S/E confirmation", async () => {
    const confirmed = await service.confirmStockTake(takeId, user.id);
    expect(confirmed.status).toBe("CONFIRMED");
    expect(await stockOf("mirror")).toBe(18);
    expect(await stockOf("seal")).toBe(30);
    expect(await stockOf("lamp")).toBe(17);
    expect(await stockOf("bolt")).toBe(6);
    expect(await stockOf("disc")).toBe(0);

    const adjustments = await prisma.stockTransaction.findMany({ where: { referenceId: takeId, type: "ADJUSTMENT" } });
    expect(adjustments.map((a) => a.quantity).sort((a, b) => a - b)).toEqual([-39, -3, 13, 30]);
    // Movements since the batch: the bolt's addition after completion and the four adjustments.
    const movements = await service.listMovements(takeId);
    expect(movements.map((m) => m.quantity).sort((a, b) => a - b)).toEqual([-39, -3, 1, 13, 30]);
    await expect(service.confirmStockTake(takeId, user.id)).rejects.toThrow("confirmed");
  });

  it("updates branch bin locations from where parts were found, once", async () => {
    const bins = await service.binProposals(takeId);
    const mirror = bins.find((b) => b.partId === parts.mirror.id)!;
    expect(mirror).toMatchObject({ currentBin: null, countedBins: "N-3D3/QSB" });

    const { updated } = await service.updateBins(takeId, [{ lineId: mirror.lineId, binLocation: "N-3D3" }], user.id);
    expect(updated).toBe(1);
    const stock = await prisma.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: branch.id, partId: parts.mirror.id } } });
    expect(stock.rackLocation).toBe("N-3D3");
    expect(await prisma.partBinHistory.count({ where: { partId: parts.mirror.id, branchId: branch.id, newBin: "N-3D3" } })).toBe(1);
    await expect(service.updateBins(takeId, [{ lineId: mirror.lineId, binLocation: "QSB" }], user.id)).rejects.toThrow("already been updated");
  });

  it("reports shortage and excess for the batch", async () => {
    const take = await prisma.stockTake.findUniqueOrThrow({ where: { id: takeId } });
    const { physicalStockRows } = require("./stockTake.report");
    const rows = await physicalStockRows({ from: "2000-01-01", to: "2000-01-01", branchId: branch.id, search: take.batchNumber, option: "DISCREPANCY" });
    expect(rows).toHaveLength(4);
    expect(rows.find((r: { partNumber: string }) => r.partNumber === parts.mirror.partNumber)).toMatchObject({
      systemQuantity: 57,
      physicalQuantity: 18,
      shortageQuantity: 39,
      shortageValue: 110334.51,
      checker: "Store Checker",
    });
  });

  it("reports the count's summary, exceptions and log (legacy Physical Stock Taking MIS)", async () => {
    const take = await prisma.stockTake.findUniqueOrThrow({ where: { id: takeId } });
    const { physicalStockRows, stockTakeLogRows } = require("./stockTake.report");
    const f = { from: "2000-01-01", to: "2000-01-01", branchId: branch.id, search: take.batchNumber };

    expect(await physicalStockRows({ ...f, option: "SUMMARY" })).toEqual([
      expect.objectContaining({
        batch: take.batchNumber,
        type: "Annual",
        status: "S/E confirmed",
        parts: 5,
        countedParts: 5,
        excessValue: 87700.73,
        shortageValue: 112434.51,
        netValue: -24733.78,
        confirmedBy: "Store Checker",
      }),
    ]);
    expect(await physicalStockRows({ ...f, option: "SUMMARY", countType: "PERPETUAL" })).toHaveLength(0);

    // Remarks: the lamp's damage and the bolt's recount.
    const remarked = await physicalStockRows({ ...f, option: "PART", onlyRemarks: true });
    expect(remarked.map((r: { remarks: string }) => r.remarks).sort()).toEqual(["Recounted", "Water damage"]);
    const byChecker = await physicalStockRows({ ...f, option: "CHECKER" });
    expect(new Set(byChecker.map((r: { group: string }) => r.group))).toEqual(new Set(["Store Checker", "No checker"]));

    // The unknown part number was set aside as not required.
    expect(await physicalStockRows({ ...f, option: "NOT_DEFINED" })).toHaveLength(0);
    const notDefined = await physicalStockRows({ ...f, option: "NOT_DEFINED", includeNotRequired: true });
    expect(notDefined).toEqual([expect.objectContaining({ partNumber: `NOT-IN-MASTER-${run}`, bin: "N-9Z9", physicalQuantity: 2, status: "Not required" })]);
    expect(await physicalStockRows({ ...f, option: "PART" })).toHaveLength(5);
    expect(await physicalStockRows({ ...f, option: "PART", includeNotRequired: true })).toHaveLength(6);
    expect(await physicalStockRows({ ...f, option: "NOT_COUNTED" })).toHaveLength(0);

    // A part found in more bins than one bin location holds (CPD 2024: 0K20133065A in nine bins).
    const bins = "29B3/63A3/67B2/73A1/71A3/75C3/75B2/71B4/71B3";
    await prisma.stockTakeLine.updateMany({ where: { stockTakeId: takeId, partId: parts.seal.id }, data: { countedBins: bins } });
    expect(await physicalStockRows({ ...f, option: "BIN_LIMIT" })).toEqual([
      expect.objectContaining({ partNumber: parts.seal.partNumber, bin: bins, binCount: 9, binLength: 44 }),
    ]);

    const sheets = await stockTakeLogRows({ ...f, option: "SHEETS" }, "COUNT");
    expect(sheets).toEqual([expect.objectContaining({ parts: 5, countedParts: 5, status: "Uploaded", checker: "Store Checker", closedBy: "Store Checker" })]);
    const corrections = await stockTakeLogRows({ ...f, option: "CORRECTIONS" }, "COUNT");
    // The bolt's recount, and the disc taken as none when the count was completed.
    expect(corrections).toEqual([
      expect.objectContaining({ partNumber: parts.bolt.partNumber, entry: "Correction", quantity: 1, remarks: "Recounted", by: "Store Checker" }),
      expect.objectContaining({ partNumber: parts.disc.partNumber, entry: "Correction", quantity: 0, remarks: expect.stringContaining("Not counted") }),
    ]);
    expect(await stockTakeLogRows({ ...f, option: "SHEETS" }, "AUDIT")).toHaveLength(0);
  });

  describe("stock audit", () => {
    let auditId = "";
    let perpetualId = "";
    const audited: Record<string, { id: string; partNumber: string }> = {};

    beforeAll(async () => {
      // The one legacy audit (AutoEnhancer batch 2012000001, Internal Audit): 5172002000 counted 41
      // against 47, 583051GA00 counted 15 against 19.
      for (const p of [
        { key: "pad", number: `5172002000-${run}`, rate: 3273.91, stock: 47 },
        { key: "shoe", number: `583051GA00-${run}`, rate: 3110.85, stock: 19 },
      ]) {
        audited[p.key] = await prisma.sparePart.create({ data: { partCode: p.number, partNumber: p.number, name: p.key.toUpperCase(), unitPrice: p.rate } });
        await prisma.inventoryStock.create({ data: { branchId: branch.id, partId: audited[p.key].id, quantity: p.stock } });
      }
      const perpetual = await service.createStockTake(
        { branchId: branch.id, type: "PERPETUAL", selection: { from: audited.pad.partNumber, to: audited.pad.partNumber } },
        user.id,
      );
      perpetualId = perpetual.stockTake.id;
    });

    it("audits parts that a physical count holds, without holding them itself", async () => {
      const preview = await service.previewParts(branch.id, { from: audited.pad.partNumber, to: audited.shoe.partNumber }, "AUDIT");
      expect(preview.every((p) => p.openBatch == null)).toBe(true);

      const { stockTake, skipped } = await service.createStockTake(
        {
          branchId: branch.id,
          type: "AUDIT",
          auditLevel: "INTERNAL",
          auditors: "Victoria",
          selection: { from: audited.pad.partNumber, to: audited.shoe.partNumber },
        },
        user.id,
      );
      auditId = stockTake.id;
      expect(skipped).toBe(0);
      expect(stockTake).toMatchObject({ auditLevel: "INTERNAL", auditors: "Victoria", summary: { lines: 2 } });

      // Another perpetual count can still take the shoe: the audit does not hold it.
      const other = await service.createStockTake(
        { branchId: branch.id, type: "PERPETUAL", selection: { from: audited.shoe.partNumber, to: audited.shoe.partNumber } },
        user.id,
      );
      expect(other.stockTake.summary.lines).toBe(1);
      await service.cancelStockTake(other.stockTake.id, "Test", user.id);
    });

    it("gives the auditor a blind sheet and completes the audit", async () => {
      const sheet = await service.createSheet(auditId, { showSystemStock: true }, user.id);
      expect(sheet.showSystemStock).toBe(false);
      await service.uploadSheet(
        auditId,
        sheet.id,
        {
          uncounted: "ZERO",
          entries: [
            { partId: audited.pad.id, binLocation: "2B2", quantity: 41 },
            { partId: audited.shoe.id, binLocation: "2E2", quantity: 10 },
            { partId: audited.shoe.id, binLocation: "15F3", quantity: 5 },
          ],
        },
        user.id,
      );
      const done = await service.completeStockTake(auditId, {}, user.id);
      expect(done.status).toBe("COMPLETED");
      expect(done.summary).toMatchObject({ counted: 2, shortageQuantity: 10, shortageValue: 32086.86 });
    });

    it("never adjusts stock or bins, and a completed audit is final", async () => {
      await expect(service.confirmStockTake(auditId, user.id)).rejects.toThrow("does not adjust stock");
      await expect(service.updateBins(auditId, [], user.id)).rejects.toThrow("does not change bin locations");
      await expect(service.cancelStockTake(auditId, "Test", user.id)).rejects.toThrow("can no longer be cancelled");
      const stock = await prisma.inventoryStock.findMany({ where: { branchId: branch.id, partId: { in: [audited.pad.id, audited.shoe.id] } } });
      expect(stock.map((s) => s.quantity).sort((a, b) => a - b)).toEqual([19, 47]);
      expect(await prisma.stockTransaction.count({ where: { referenceId: auditId } })).toBe(0);
    });

    it("lists and reports audits apart from physical counts", async () => {
      const audits = await service.listStockTakes({ kind: "AUDIT", branchId: branch.id });
      const counts = await service.listStockTakes({ branchId: branch.id });
      expect(audits.map((t) => t.id)).toEqual([auditId]);
      expect(counts.map((t) => t.id)).toContain(perpetualId);
      expect(counts.map((t) => t.id)).not.toContain(auditId);

      const take = await prisma.stockTake.findUniqueOrThrow({ where: { id: auditId } });
      const { physicalStockRows } = require("./stockTake.report");
      const filters = { from: "2000-01-01", to: "2000-01-01", branchId: branch.id, search: take.batchNumber, option: "DISCREPANCY" };
      expect(await physicalStockRows(filters)).toHaveLength(0);
      const rows = await physicalStockRows(filters, "AUDIT");
      expect(rows.find((r: { partNumber: string }) => r.partNumber === audited.shoe.partNumber)).toMatchObject({
        systemQuantity: 19,
        physicalQuantity: 15,
        shortageQuantity: 4,
        checker: "Victoria",
      });

      // Stock Audit History: the part's audits, under its own heading.
      const history = await physicalStockRows({ ...filters, option: "HISTORY" }, "AUDIT");
      expect(history.map((r: { group: string }) => r.group)).toContain(`${audited.shoe.partNumber} · SHOE`);
      expect(history.find((r: { partNumber: string }) => r.partNumber === audited.pad.partNumber)).toMatchObject({ type: "Internal audit" });
      expect(await physicalStockRows({ ...filters, option: "SUMMARY", countType: "INTERNAL" }, "AUDIT")).toEqual([
        expect.objectContaining({ auditors: "Victoria", countedParts: 2, shortageValue: 32086.86 }),
      ]);
      expect(await physicalStockRows({ ...filters, option: "SUMMARY", countType: "AUDIT_HEAD" }, "AUDIT")).toHaveLength(0);
    });
  });
});
