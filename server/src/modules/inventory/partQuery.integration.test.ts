/**
 * Part Query and stock location against a real database.
 * Skipped unless TEST_DATABASE_URL points at a separate, migrated database.
 */
import type { PrismaClient } from '@prisma/client';
import type { InventoryService as InventoryServiceType } from './inventory.service';
import type { BranchService as BranchServiceType } from '../branch/branch.service';

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Part Query (database)', () => {
  let prisma: PrismaClient;
  let inventory: InventoryServiceType;
  let branchService: BranchServiceType;
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    inventory = new (require('./inventory.service').InventoryService)();
    branchService = new (require('../branch/branch.service').BranchService)();

    const kp = await branchService.createBranch({ name: `Kia Plaza ${run}`, code: `A${run}`.slice(0, 10) });
    const qs = await branchService.createBranch({ name: `QSB ${run}`, code: `Q${run}`.slice(0, 10), parentBranchId: kp.id });
    const vi = await branchService.createBranch({ name: `VI ${run}`, code: `V${run}`.slice(0, 10) });
    Object.assign(ids, { kp: kp.id, qs: qs.id, vi: vi.id });

    const main = await inventory.createPart({
      partCode: `PQ-${run}`,
      partNumber: `PQ${run}`,
      name: 'FILTER ASSY-ENGINE OIL',
      category: 'Filters',
      uom: 'NOS',
      unitRate: 9056.34,
      retailRate: 18746.62,
      taxable: true,
      partFlag: 'O',
    });
    const alt = await inventory.createAlternatePart({ mainPartId: main.id, partNumber: `PQ${run}A`, name: 'FILTER' });
    Object.assign(ids, { main: main.id, alt: alt.id });

    await prisma.inventoryStock.createMany({
      data: [
        { branchId: kp.id, partId: main.id, quantity: 5, reservedQuantity: 1 },
        { branchId: vi.id, partId: main.id, quantity: 52 },
      ],
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('enforces a one-level branch hierarchy', async () => {
    await expect(
      branchService.createBranch({ name: `Nested ${run}`, parentBranchId: ids.qs }),
    ).rejects.toThrow(/itself a sub-location/);
    await expect(branchService.updateBranch(ids.kp, { parentBranchId: ids.vi })).rejects.toThrow(
      /has its own sub-locations/,
    );
    await expect(branchService.updateBranch(ids.vi, { parentBranchId: ids.vi })).rejects.toThrow(/itself/);
    await expect(branchService.createBranch({ name: `Dup ${run}`, code: `A${run}`.slice(0, 10) })).rejects.toThrow(
      /already used/,
    );
  });

  it('sets rack location and bin card per branch without touching quantity', async () => {
    const stock = await inventory.updateStockLocation(ids.kp, ids.main, { rackLocation: 'N-QSB', binCard: 'AUTO' });
    expect(stock).toMatchObject({ quantity: 5, rackLocation: 'N-QSB', binCard: 'AUTO', availableQuantity: 4 });
    const created = await inventory.updateStockLocation(ids.kp, ids.alt, { rackLocation: 'M2-BOX' });
    expect(created).toMatchObject({ quantity: 0, rackLocation: 'M2-BOX' });
  });

  it('returns the three legacy grids', async () => {
    const result = await inventory.partQuery(`pq${run}`, ids.qs);
    expect(result.part).toMatchObject({ dealerRate: 9056.34, retailRate: 18746.62, taxable: true, partFlag: 'O' });
    expect(result.locations.map((l) => [l.branchId, l.currentStock])).toEqual([
      [ids.kp, 5],
      [ids.qs, 0],
    ]);
    expect(result.locations[0]).toMatchObject({ location: 'N-QSB', binCard: 'AUTO', qtyBlocked: 1 });
    expect(result.alternates).toHaveLength(1);
    expect(result.alternates[0]).toMatchObject({ partId: ids.alt, branchId: ids.kp, location: 'M2-BOX', retailRate: 18746.62 });
    const vi = result.otherBranches.find((b) => b.branchId === ids.vi);
    expect(vi).toMatchObject({ currentStock: 52 });
    expect(result.otherBranches.some((b) => b.branchId === ids.kp || b.branchId === ids.qs)).toBe(false);
  });

  it('finds a part by part code and reports unknown parts', async () => {
    const byCode = await inventory.partQuery(`PQ-${run}`, ids.kp);
    expect(byCode.part.id).toBe(ids.main);
    await expect(inventory.partQuery(`NOPE${run}`, ids.kp)).rejects.toThrow(/not found/);
  });
});
