export type BranchStockItem = {
  id: string;
  branchId: string;
  partId: string;
  quantity: number;
  reservedQuantity: number;
  minimumStock: number;
  rackLocation: string | null;
  binCard?: string | null;
  maximumStock: number | null;
  /** Raw Part Master row as returned by the stock endpoints (price is `unitPrice`). */
  part: Omit<PartMaster, "unitRate"> & { unitPrice: number };
};

export type BranchStockListResponse = {
  stockItems: BranchStockItem[];
};

// ── Part Master (backend contract: /inventory/parts) ─────────────────────────

export type PartStatus = "ACTIVE" | "BLOCKED";
export type PartRole = "MAIN" | "ALTERNATE";

/**
 * A Part Master record. The list endpoint returns the price as `unitPrice`
 * and the detail endpoint as `unitRate`; the API layer normalises both to `unitRate`.
 */
export type PartMaster = {
  id: string;
  partCode: string;
  partNumber: string;
  name: string;
  description: string | null;
  category: string | null;
  uom: string;
  taxCategory: string | null;
  taxForm: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  reorderQty: number | null;
  /** Dealer rate (legacy dlrrate). */
  unitRate: number;
  /** Retail (selling) rate (legacy rtlrate). */
  retailRate: number | null;
  /** Legacy tax status. */
  taxable: boolean;
  /** Legacy part flag, for example O for original. */
  partFlag: string;
  binLocation: string | null;
  storeLocation: string | null;
  partStatus: PartStatus;
  role: PartRole;
  mainPartId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartMasterPayload = {
  partCode: string;
  partNumber: string;
  name: string;
  category: string;
  uom: string;
  taxCategory?: string;
  taxForm?: string;
  minLevel?: number;
  maxLevel?: number;
  reorderQty?: number;
  unitRate: number;
  retailRate?: number;
  taxable?: boolean;
  partFlag?: string;
  binLocation?: string;
  storeLocation?: string;
  partStatus?: PartStatus;
};

export type UpdatePartMasterPayload = Partial<PartMasterPayload>;

export type PartListParams = {
  search?: string;
  category?: string;
  partStatus?: PartStatus;
  role?: PartRole;
  mainPartId?: string;
  page?: number;
  limit?: number;
};

export type PartListResponse = {
  items: PartMaster[];
  total: number;
  page: number;
  pageSize: number;
};

export type AlternatePartPayload = {
  partNumber: string;
  name: string;
  description?: string;
};

export type PartStockItem = {
  id: string;
  branchId: string;
  branch: { id: string; name: string };
  partId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  minimumStock: number;
  maximumStock: number | null;
  rackLocation: string | null;
  binCard: string | null;
};

export type StockLocationPayload = {
  rackLocation?: string | null;
  binCard?: string | null;
  minimumStock?: number;
  maximumStock?: number | null;
};

// ── Part Query (legacy Master > Part Query) ───────────────────────────────────

export type PartQueryRow = {
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
};

export type PartQueryAlternateRow = PartQueryRow & {
  partId: string;
  partNumber: string;
  description: string;
  partStatus: PartStatus;
};

export type PartQueryResult = {
  part: {
    id: string;
    partNumber: string;
    partCode: string;
    name: string;
    description: string | null;
    uom: string;
    partFlag: string;
    taxable: boolean;
    dealerRate: number;
    retailRate: number | null;
    partStatus: PartStatus;
    role: PartRole;
    mainPartId: string | null;
  };
  premises: { id: string; name: string; code: string | null }[];
  locations: PartQueryRow[];
  alternates: PartQueryAlternateRow[];
  otherBranches: PartQueryRow[];
  totals: { premisesStock: number; otherBranchesStock: number };
};
