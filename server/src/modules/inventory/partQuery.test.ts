import { buildPartQuery, premisesOf, QueryBranch, QueryPart, QueryStock } from './partQuery';

const part = (over: Partial<QueryPart>): QueryPart => ({
  id: 'p1',
  partNumber: '2630035505',
  partCode: 'KIA-2630035505',
  name: 'FILTER ASSY-ENGINE OIL',
  description: null,
  uom: 'NOS',
  partFlag: 'O',
  taxable: true,
  unitPrice: 9056.34,
  retailRate: 18746.62,
  partStatus: 'ACTIVE',
  role: 'MAIN',
  mainPartId: null,
  ...over,
});

// Kia Plaza premises (with QSB and KP1 WH as sub-locations) plus two other branches.
const branches: QueryBranch[] = [
  { id: 'kp', name: 'Kia Plaza', code: 'A', parentBranchId: null },
  { id: 'qs', name: 'Quick Service Bay', code: 'QS', parentBranchId: 'kp' },
  { id: 'k1', name: 'KP1 Parts WH', code: 'K1', parentBranchId: 'kp' },
  { id: 'vi', name: 'Victoria Island', code: 'VI', parentBranchId: null },
  { id: 'ug', name: 'Utako Branch', code: 'UG', parentBranchId: null },
];

const stock = (partId: string, branchId: string, quantity: number, extra: Partial<QueryStock> = {}): QueryStock => ({
  partId,
  branchId,
  quantity,
  reservedQuantity: 0,
  rackLocation: null,
  binCard: null,
  ...extra,
});

describe('premisesOf', () => {
  it('returns the main branch first, then its sub-locations', () => {
    expect(premisesOf('kp', branches).map((b) => b.code)).toEqual(['A', 'K1', 'QS']);
  });

  it('resolves the same premises when the home is a sub-location', () => {
    expect(premisesOf('qs', branches).map((b) => b.code)).toEqual(['A', 'K1', 'QS']);
  });

  it('is empty without a home branch', () => {
    expect(premisesOf(null, branches)).toEqual([]);
  });
});

describe('buildPartQuery', () => {
  const main = part({});
  const alt = part({ id: 'p2', partNumber: '2630035503', name: 'FILTER', unitPrice: 6947.1, retailRate: 14380.5, role: 'ALTERNATE', mainPartId: 'p1' });
  const stocks = [
    stock('p1', 'kp', 5, { rackLocation: 'N-QSB', binCard: 'AUTO', reservedQuantity: 1 }),
    stock('p1', 'vi', 52, { rackLocation: 'QSB' }),
    stock('p1', 'ug', 12, { rackLocation: 'AUTO', binCard: 'AUTO' }),
    stock('p2', 'kp', 0, { rackLocation: 'M2-BOX' }),
  ];

  const result = buildPartQuery({ part: main, alternates: [alt], branches, stocks, homeBranchId: 'kp' });

  it('grid 1 lists every premises location, zero where there is no stock record', () => {
    expect(result.locations.map((r) => [r.branchCode, r.currentStock])).toEqual([
      ['A', 5],
      ['K1', 0],
      ['QS', 0],
    ]);
    expect(result.locations[0]).toMatchObject({
      partFlag: 'O',
      taxable: true,
      location: 'N-QSB',
      binCard: 'AUTO',
      dealerRate: 9056.34,
      retailRate: 18746.62,
      qtyBlocked: 1,
      available: 4,
    });
  });

  it('grid 2 lists alternates with their own rates and location', () => {
    expect(result.alternates).toHaveLength(1);
    expect(result.alternates[0]).toMatchObject({
      partNumber: '2630035503',
      branchCode: 'A',
      location: 'M2-BOX',
      dealerRate: 6947.1,
      retailRate: 14380.5,
    });
  });

  it('grid 3 lists only other branches that hold the part', () => {
    expect(result.otherBranches.map((r) => [r.branchCode, r.currentStock])).toEqual([
      ['UG', 12],
      ['VI', 52],
    ]);
    expect(result.totals).toEqual({ premisesStock: 5, otherBranchesStock: 64 });
  });

  it('shows an alternate with no stock records as one zero row at the main premises', () => {
    const r = buildPartQuery({ part: main, alternates: [alt], branches, stocks: stocks.slice(0, 3), homeBranchId: 'qs' });
    expect(r.alternates).toHaveLength(1);
    expect(r.alternates[0]).toMatchObject({ branchCode: 'A', currentStock: 0, hasStockRecord: false });
  });

  it('puts every branch in grid 3 when the user has no home branch', () => {
    const r = buildPartQuery({ part: main, alternates: [], branches, stocks, homeBranchId: null });
    expect(r.locations).toEqual([]);
    expect(r.otherBranches.map((x) => x.branchCode)).toEqual(['A', 'UG', 'VI']);
  });
});
