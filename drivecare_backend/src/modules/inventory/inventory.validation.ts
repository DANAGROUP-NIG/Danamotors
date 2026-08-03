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
