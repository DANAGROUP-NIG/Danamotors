export type InventoryItem = {
  id: string;
  partNumber: string;
  name: string;
  description?: string;
  category: string;
  unitPrice: number;
  supplierId?: string;
  createdAt: string;
  updatedAt: string;
};

export type BranchStockEntry = {
  branchId: string;
  quantity: number;
  minimumStock?: number;
  rackLocation?: string;
};

export type SparePartPayload = {
  partNumber: string;
  name: string;
  description?: string;
  category: string;
  unitPrice: number;
  branchStock?: BranchStockEntry[];
};

export type UpdateSparePartPayload = Partial<SparePartPayload>;

export type BranchStockItem = {
  id: string;
  branchId: string;
  partId: string;
  quantity: number;
  reservedQuantity: number;
  minimumStock: number;
  rackLocation: string | null;
  maximumStock: number | null;
  part: InventoryItem;
};

export type BranchStockListResponse = {
  stockItems: BranchStockItem[];
};
