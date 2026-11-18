/**
 * Finance → Mobis pricing against a real database: the rate setting, bulletin runs and rate revaluation.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from "@prisma/client";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(120_000);

describeDb("Mobis pricing (database)", () => {
  let prisma: PrismaClient;
  let svc: typeof import("./mobis-pricing.service");
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-8);
  let user: { id: string };
  const pn = (s: string) => `${s}${run}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    svc = require("./mobis-pricing.service");
    const role = await prisma.role.upsert({ where: { name: "Accountant" }, update: {}, create: { name: "Accountant" } });
    user = await prisma.user.create({ data: { email: `pricing.${run}@test.local`, passwordHash: "x", firstName: "Fin", lastName: "Test", roleId: role.id } });
    await prisma.partCategory.upsert({ where: { code: "C" }, update: { markupMultiplier: 3.33 }, create: { code: "C", description: "C", markupMultiplier: 3.33 } });
    const value = { conversionRate: 2700, dealerFactor: 0.616 };
    await prisma.financeSetting.upsert({ where: { key: "mobisPricing" }, update: { value }, create: { key: "mobisPricing", value } });
    const main = await prisma.sparePart.create({ data: { partNumber: pn("GASKET"), name: "GASKET-CYLINDER HEAD", priceCategoryCode: "C", unitPrice: 49098.42, retailRate: 163497.74 } });
    await prisma.sparePart.create({ data: { partNumber: pn("FILTER"), name: "FILTER ASSY-ENGINE OIL", priceCategoryCode: "C", unitPrice: 7365.6, retailRate: 15246.79 } });
    await prisma.sparePart.create({ data: { partNumber: pn("LOCAL"), name: "LOCAL BOLT", partFlag: "L", unitPrice: 500, retailRate: 750 } });
    // A used-part source record shares no number with the bulletin's, so it is never priced from it.
    await prisma.sparePart.create({ data: { partNumber: pn("GASKET") + "-U", name: "GASKET USED", partFlag: "U", sourceOfPartId: main.id, unitPrice: 100 } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("previews a bulletin without changing any part", async () => {
    const preview = await svc.previewBulletin([
      { partNumber: pn("GASKET"), listPrice: 32.26 },
      { partNumber: pn("FILTER"), listPrice: 4.36 },
      { partNumber: pn("NOPE"), listPrice: 9 },
    ]);
    expect(preview.summary).toEqual({ lines: 3, increase: 1, notHigher: 1, notFound: 1 });
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("GASKET") } })).unitPrice).toBe(49098.42);
  });

  it("applies only increases, links the history to the run, and refuses the same bulletin twice", async () => {
    const input = {
      reference: `KIA Irregular Price Adjustment Bulletin - TEST ${run}`,
      sourceFileName: "KIA - Irregular Price Adjustment 06-11-2026 - Others.xlsx",
      conversionRate: 2700,
      dealerFactor: 0.616,
      lines: [{ partNumber: pn("GASKET"), listPrice: 32.26 }, { partNumber: pn("FILTER"), listPrice: 4.36 }],
    };
    const done = await svc.applyBulletin({ userId: user.id }, input);
    expect(done.adjustment).toMatchObject({ kind: "BULLETIN", updatedCount: 1, notHigherCount: 1, notFoundCount: 0, conversionRate: 2700, dealerFactor: 0.616 });
    expect(done.changes).toEqual([expect.objectContaining({ partNumber: pn("GASKET"), oldDealerRate: 49098.42, newDealerRate: 53654.83, newRetailRate: 178670.58 })]);
    const gasket = await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("GASKET") } });
    expect([gasket.unitPrice, gasket.retailRate]).toEqual([53654.83, 178670.58]);
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("FILTER") } })).unitPrice).toBe(7365.6);
    await expect(svc.applyBulletin({ userId: user.id }, input)).rejects.toThrow(/already applied/);
  });

  it("refuses a bulletin previewed at a rate Finance has since changed", async () => {
    await expect(
      svc.applyBulletin({ userId: user.id }, { reference: `Other ${run}`, conversionRate: 2500, dealerFactor: 0.616, lines: [{ partNumber: pn("GASKET"), listPrice: 99 }] }),
    ).rejects.toThrow(/changed since the preview/);
  });

  it("saves a lower rate without touching prices, and revalues O/A parts when the rate goes up", async () => {
    await expect(svc.saveMobisPricing({ userId: user.id }, { conversionRate: 2500, dealerFactor: 0.616, revalue: true })).rejects.toThrow(/only revalued when the conversion rate goes up/);
    const saved = await svc.saveMobisPricing({ userId: user.id }, { conversionRate: 2500, dealerFactor: 0.616 });
    expect(saved.pricing).toMatchObject({ conversionRate: 2500 });
    expect(saved.adjustment).toBeNull();

    const preview = await svc.previewRevaluation(3000);
    expect(preview.ratio).toBeCloseTo(1.2, 6);

    const up = await svc.saveMobisPricing({ userId: user.id }, { conversionRate: 3000, dealerFactor: 0.616, revalue: true });
    expect(up.adjustment?.adjustment).toMatchObject({ kind: "RATE_CHANGE", previousRate: 2500, conversionRate: 3000 });
    const gasket = await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("GASKET") } });
    expect([gasket.unitPrice, gasket.retailRate]).toEqual([64385.8, 214404.7]);
    // Local (L) and source records are priced in naira and left alone.
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("LOCAL") } })).unitPrice).toBe(500);
    expect((await prisma.sparePart.findUniqueOrThrow({ where: { partNumber: pn("GASKET") + "-U" } })).unitPrice).toBe(100);
    const history = await prisma.partRateHistory.findMany({ where: { adjustmentId: up.adjustment!.adjustment.id, partNumber: { endsWith: run } } });
    expect(history.map((h) => h.partNumber).sort()).toEqual([pn("FILTER"), pn("GASKET")]);
    expect(history.every((h) => h.changedById === user.id)).toBe(true);
  });
});
