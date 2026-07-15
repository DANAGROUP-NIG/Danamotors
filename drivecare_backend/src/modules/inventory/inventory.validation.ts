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

export const createSparePartSchema = z.object({
  body: z.object({
    partNumber: z.string().min(1, 'Part number is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    category: z.string().optional(),
    unitPrice: z.number().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    minimumStock: z.number().int().nonnegative().optional(),
  }),
});

export const updateSparePartSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    unitPrice: z.number().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    minimumStock: z.number().int().nonnegative().optional(),
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
    jobCardId: z.string().uuid('Invalid job card ID').optional(),
    issuedById: z.string().uuid('Invalid issuer ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    notes: z.string().optional(),
  }),
});

export const createPartReturnSchema = z.object({
  body: z.object({
    partIssuanceId: z.string().uuid('Invalid part issuance ID'),
    returnedById: z.string().uuid('Invalid returner ID'),
    quantity: z.number().int().positive('Quantity must be positive'),
    reason: z.string().optional(),
    status: z.string().optional(),
  }),
});
