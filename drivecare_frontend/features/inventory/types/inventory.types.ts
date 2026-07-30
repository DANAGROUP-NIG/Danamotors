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

export type SparePartPayload = {
  partNumber: string;
  name: string;
  description?: string;
  category: string;
  unitPrice: number;
};

export type UpdateSparePartPayload = Partial<SparePartPayload>;

export type BranchStockItem = {
  id: string;
  branchId: string;
  partId: string;
  quantity: number;
  reservedQuantity: number;
  minimumStock: number;
  maximumStock: number | null;
  part: InventoryItem;
};

export type BranchStockListResponse = {
  stockItems: BranchStockItem[];
};
