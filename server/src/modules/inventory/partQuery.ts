/**
 * Part Query (legacy Master > Part Query).
 *
 * The legacy screen shows three grids for a part number:
 *   1. Stock at every store location of the user's own premises
 *      (e.g. Kia Plaza, Quick Service Bay, KP1 Parts WH, virtual godowns).
 *   2. The same for each alternate part.
 *   3. Stock at the other branches.
 *
 * Here a "premises" is a top-level branch plus its sub-locations
 * (branches whose parentBranchId points to it). This file only shapes data;
 * the service loads it.
 */

export interface QueryPart {
  id: string;
  partNumber: string;
  partCode: string;
  name: string;
  description: string | null;
  uom: string;
  partFlag: string;
  taxable: boolean;
  unitPrice: number;
  retailRate: number | null;
  partStatus: string;
  role: string;
  mainPartId: string | null;
}

export interface QueryBranch {
  id: string;
  name: string;
  code: string | null;
  parentBranchId: string | null;
}

export interface QueryStock {
  branchId: string;
  partId: string;
  quantity: number;
  reservedQuantity: number;
  rackLocation: string | null;
  binCard: string | null;
}

export interface StockRow {
  branchId: string;
  branchName: string;
  branchCode: string | null;
  partFlag: string;
  taxable: boolean;
  currentStock: number;
  qtyBlocked: number;
  available: number;
  location: string | null;
  binCard: string | null;
  dealerRate: number;
  retailRate: number | null;
  hasStockRecord: boolean;
}

export interface AlternateRow extends StockRow {
  partId: string;
  partNumber: string;
  description: string;
  partStatus: string;
}

function row(part: QueryPart, branch: QueryBranch, stock?: QueryStock): StockRow {
  const qty = stock?.quantity ?? 0;
  const blocked = stock?.reservedQuantity ?? 0;
  return {
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code,
    partFlag: part.partFlag,
    taxable: part.taxable,
    currentStock: qty,
    qtyBlocked: blocked,
    available: qty - blocked,
    location: stock?.rackLocation ?? null,
    binCard: stock?.binCard ?? null,
    dealerRate: part.unitPrice,
    retailRate: part.retailRate,
    hasStockRecord: Boolean(stock),
  };
}

/** The top-level branch and its sub-locations, top-level first. */
export function premisesOf(homeBranchId: string | null | undefined, branches: QueryBranch[]): QueryBranch[] {
  if (!homeBranchId) return [];
  const home = branches.find((b) => b.id === homeBranchId);
  if (!home) return [];
  const rootId = home.parentBranchId ?? home.id;
  const root = branches.find((b) => b.id === rootId);
  const subs = branches
    .filter((b) => b.parentBranchId === rootId)
    .sort((a, b) => a.name.localeCompare(b.name));
  return root ? [root, ...subs] : subs;
}

export function buildPartQuery(input: {
  part: QueryPart;
  alternates: QueryPart[];
  branches: QueryBranch[];
  stocks: QueryStock[];
  homeBranchId?: string | null;
}) {
  const { part, alternates, branches, stocks } = input;
  const premises = premisesOf(input.homeBranchId, branches);
  const premisesIds = new Set(premises.map((b) => b.id));
  const stockOf = (partId: string, branchId: string) =>
    stocks.find((s) => s.partId === partId && s.branchId === branchId);

  // Grid 1: every location at the user's premises, including those with no stock record (shown as 0).
  const locations = premises.map((b) => row(part, b, stockOf(part.id, b.id)));

  // Grid 2: each alternate at the premises locations where it has a stock record,
  // or a single zero row at the main premises when it has none.
  const alternateRows: AlternateRow[] = alternates.flatMap((alt) => {
    const withStock = premises.filter((b) => stockOf(alt.id, b.id));
    const targets = withStock.length ? withStock : premises.slice(0, 1);
    const extra = { partId: alt.id, partNumber: alt.partNumber, description: alt.name, partStatus: alt.partStatus };
    if (targets.length === 0) {
      // No premises (e.g. a super admin without a branch): report the alternate without a location.
      return [
        {
          ...row(alt, { id: "", name: "—", code: null, parentBranchId: null }),
          ...extra,
        },
      ];
    }
    return targets.map((b) => ({ ...row(alt, b, stockOf(alt.id, b.id)), ...extra }));
  });

  // Grid 3: other branches that hold a stock record for the part.
  const otherBranches = branches
    .filter((b) => !premisesIds.has(b.id) && stockOf(part.id, b.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => row(part, b, stockOf(part.id, b.id)));

  const sum = (rows: StockRow[]) => rows.reduce((s, r) => s + r.currentStock, 0);
  return {
    part: {
      id: part.id,
      partNumber: part.partNumber,
      partCode: part.partCode,
      name: part.name,
      description: part.description,
      uom: part.uom,
      partFlag: part.partFlag,
      taxable: part.taxable,
      dealerRate: part.unitPrice,
      retailRate: part.retailRate,
      partStatus: part.partStatus,
      role: part.role,
      mainPartId: part.mainPartId,
    },
    premises: premises.map((b) => ({ id: b.id, name: b.name, code: b.code })),
    locations,
    alternates: alternateRows,
    otherBranches,
    totals: {
      premisesStock: sum(locations),
      otherBranchesStock: sum(otherBranches),
    },
  };
}
