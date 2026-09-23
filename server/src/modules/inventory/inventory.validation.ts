import { z } from 'zod';

export const partIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid spare part ID'),
  }),
});

export const purchaseRequestIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid purchase request ID'),
  }),
});

export const partIssuanceIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid part issuance ID'),
  }),
});

export const partReturnIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid part return ID'),
  }),
});

export const transferIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid transfer ID'),
  }),
});

export const createSparePartSchema = z.object({
  body: z.object({
    partNumber: z.string().min(1, 'Part number is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    category: z.string().optional(),
    unitPrice: z.number().nonnegative().optional(),
    branchStock: z.array(z.object({
      branchId: z.string().uuid('Invalid branch ID'),
      quantity: z.number().int().nonnegative('Quantity must be 0 or more'),
      minimumStock: z.number().int().nonnegative().optional(),
      rackLocation: z.string().max(100).optional(),
    })).optional(),
  }),
});

export const updateSparePartSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    unitPrice: z.number().nonnegative().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid spare part ID'),
  }),
});

const partStatusEnum = z.enum(['ACTIVE', 'BLOCKED']);

const basePartMasterFields = {
  partCode: z.string().min(1, 'Part code is required').max(50, 'Part code must be 50 characters or less'),
  partNumber: z.string().min(1, 'Part number is required'),
  name: z.string().min(1, 'Name is required'),
  category: z.string().min(1, 'Category is required'),
  uom: z.string().min(1, 'Unit of measure is required'),
  taxCategory: z.string().optional(),
  taxForm: z.string().optional(),
  minLevel: z.number().nonnegative('Minimum level must be 0 or more').optional(),
  maxLevel: z.number().nonnegative('Maximum level must be 0 or more').optional(),
  reorderQty: z.number().nonnegative('Reorder quantity must be 0 or more').optional(),
  unitRate: z.number().positive('Unit rate must be greater than zero'),
  binLocation: z.string().optional(),
  storeLocation: z.string().optional(),
};

export const createPartMasterSchema = z.object({
  body: z.object({
    ...basePartMasterFields,
    partStatus: partStatusEnum.optional(),
  }).refine(
    (data) => {
      if (data.minLevel == null || data.maxLevel == null) return true;
      return data.maxLevel >= data.minLevel;
    },
    {
      message: 'Maximum level must be greater than or equal to minimum level',
      path: ['maxLevel'],
    },
  ),
});

export const updatePartMasterSchema = z.object({
  body: z.object({
    partCode: basePartMasterFields.partCode.optional(),
    partNumber: basePartMasterFields.partNumber.optional(),
    name: basePartMasterFields.name.optional(),
    category: basePartMasterFields.category.optional(),
    uom: basePartMasterFields.uom.optional(),
    taxCategory: basePartMasterFields.taxCategory,
    taxForm: basePartMasterFields.taxForm,
    minLevel: basePartMasterFields.minLevel,
    maxLevel: basePartMasterFields.maxLevel,
    reorderQty: basePartMasterFields.reorderQty,
    unitRate: basePartMasterFields.unitRate.optional(),
    binLocation: basePartMasterFields.binLocation,
    storeLocation: basePartMasterFields.storeLocation,
    partStatus: partStatusEnum.optional(),
  }).refine(
    (data) => {
      if (data.minLevel == null || data.maxLevel == null) return true;
      return data.maxLevel >= data.minLevel;
    },
    {
      message: 'Maximum level must be greater than or equal to minimum level',
      path: ['maxLevel'],
    },
  ),
  params: z.object({
    id: z.string().uuid('Invalid part ID'),
  }),
});

export const partMasterIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid part ID'),
  }),
});

export const listPartsQuerySchema = z.object({
  query: z.object({
    partCode: z.string().optional(),
    partNumber: z.string().optional(),
    name: z.string().optional(),
    category: z.string().optional(),
    partStatus: partStatusEnum.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const createPurchaseRequestSchema = z.object({
  body: z.object({
    sparePartId: z.string().uuid('Invalid spare part ID'),
    requestedById: z.string().uuid('Invalid requester ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    status: z.string().optional(),
    approvalNotes: z.string().optional(),
  }),
});

export const updatePurchaseRequestStatusSchema = z.object({
  body: z.object({
    status: z.string().min(1, 'Status is required'),
    approvalNotes: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid purchase request ID'),
  }),
});

export const createPartIssuanceSchema = z.object({
  body: z.object({
    sparePartId: z.string().uuid('Invalid spare part ID'),
    branchId: z.string().uuid('Invalid branch ID'),
    jobCardId: z.string().uuid('Invalid job card ID').optional(),
    issuedById: z.string().uuid('Invalid issuer ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    notes: z.string().optional(),
  }),
});

export const createPartReturnSchema = z.object({
  body: z.object({
    partIssuanceId: z.string().uuid('Invalid part issuance ID'),
    branchId: z.string().uuid('Invalid branch ID'),
    returnedById: z.string().uuid('Invalid returner ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    reason: z.string().optional(),
    status: z.string().optional(),
  }),
});

export const adjustStockSchema = z.object({
  body: z.object({
    branchId: z.string().uuid('Invalid branch ID'),
    partId: z.string().uuid('Invalid part ID'),
    quantity: z.number().int('Quantity must be an integer'),
    type: z.string().min(1, 'Transaction type is required'),
    notes: z.string().optional(),
  }),
});

export const createTransferSchema = z.object({
  body: z.object({
    requestingBranchId: z.string().uuid('Invalid requesting branch ID'),
    sourceBranchId: z.string().uuid('Invalid source branch ID'),
    notes: z.string().optional(),
    items: z.array(z.object({
      partId: z.string().uuid('Invalid part ID'),
      requestedQuantity: z.number().int().positive('Quantity must be positive'),
    })).min(1, 'At least one item is required'),
  }),
});

export const updateTransferStatusSchema = z.object({
  body: z.object({
    notes: z.string().optional(),
    items: z.array(z.object({
      id: z.string().uuid('Invalid item ID'),
      dispatchedQuantity: z.number().int().nonnegative().optional(),
      receivedQuantity: z.number().int().nonnegative().optional(),
    })).optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid transfer ID'),
  }),
});

export const branchIdParamSchema = z.object({
  params: z.object({
    branchId: z.string().uuid('Invalid branch ID'),
  }),
});

export const branchPartParamSchema = z.object({
  params: z.object({
    branchId: z.string().uuid('Invalid branch ID'),
    partId: z.string().uuid('Invalid part ID'),
  }),
});

export const stockQuerySchema = z.object({
  query: z.object({
    branchId: z.string().uuid('Invalid branch ID').optional(),
    partId: z.string().uuid('Invalid part ID').optional(),
    search: z.string().trim().optional(),
  }),
});
