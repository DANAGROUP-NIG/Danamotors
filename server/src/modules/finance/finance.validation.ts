import { z } from 'zod';
const amount = z.number().finite().positive().max(1e12).multipleOf(0.01);

export const invoiceIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid invoice ID') }),
});

export const paymentIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid payment ID') }),
});

export const receiptIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid receipt ID') }),
});

export const createInvoiceSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    invoiceNumber: z.string().min(1, 'Invoice number is required'),
    issuedDate: z.string().datetime().optional(),
    dueDate: z.string().datetime().optional(),
    subtotal: z.number().nonnegative('Subtotal must be non-negative'),
    tax: z.number().nonnegative('Tax must be non-negative').optional(),
    total: z.number().nonnegative('Total must be non-negative'),
    status: z.string().optional(),
    notes: z.string().optional(),
  }).strict(),
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    dueDate: z.string().datetime().optional(),
    notes: z.string().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one editable field is required'),
  params: z.object({ id: z.string().uuid('Invalid invoice ID') }),
});

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().uuid('Invalid invoice ID'),
    // Optional: the controller always overrides this with the authenticated user.
    recordedById: z.string().uuid('Invalid user ID').optional(),
    amount: z.number().positive('Payment amount must be positive'),
    method: z.string().min(1, 'Payment method is required'),
    paymentDate: z.string().datetime().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const createReceiptSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    branchId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid().optional(),
    mode: z.enum(['POS', 'BANK_TRANSFER', 'CHEQUE', 'CASH']),
    category: z.enum(['SERVICE_PARTS', 'SALES_ENQUIRY']).default('SERVICE_PARTS'),
    bankId: z.string().uuid('Invalid bank ID').optional(),
    amount,
    chequeNumber: z.string().trim().min(1).max(100).optional(),
    chequeDate: z.string().date().optional(),
    reference: z.string().max(150).optional(),
    narration: z.string().max(1000).optional(),
    issuedAt: z.string().datetime().optional(),
    allocations: z.array(z.object({
      invoiceId: z.string().uuid('Invalid invoice ID'),
      amount,
    }).strict()).max(200).default([]),
  }).strict().superRefine((body, context) => {
    if (body.mode !== 'CASH' && !body.bankId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankId'], message: 'A bank is required for POS, transfer and cheque receipts' });
    }
    if (body.mode === 'CASH' && body.bankId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bankId'], message: 'Cash receipts must not specify a bank' });
    }
    const invoiceIds = body.allocations.map((allocation) => allocation.invoiceId);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'Each invoice can only appear once' });
    }
    if (body.mode === 'CHEQUE' && (!body.chequeNumber || !body.chequeDate)) context.addIssue({ code: 'custom', path: ['chequeNumber'], message: 'Cheque number and date are required' });
    if (body.mode !== 'CHEQUE' && (body.chequeNumber || body.chequeDate)) context.addIssue({ code: 'custom', path: ['mode'], message: 'Cheque details are only allowed for cheque receipts' });
    if (body.allocations.reduce((sum, allocation) => sum + Math.round(allocation.amount * 100), 0) > Math.round(body.amount * 100)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'Allocations cannot exceed the receipt amount' });
    }
  }),
});

export const jobBillPreviewSchema = z.object({
  body: z.object({
    jobCardId: z.string().uuid('Invalid job card ID'),
    partsDiscountPercent: z.number().min(0).max(100).default(0),
    labourDiscountPercent: z.number().min(0).max(100).default(0),
  }).strict(),
});

export const createJobBillSchema = z.object({
  body: z.object({
    jobCardId: z.string().uuid('Invalid job card ID'),
    partsDiscountPercent: z.number().min(0).max(100).default(0),
    labourDiscountPercent: z.number().min(0).max(100).default(0),
    serviceAdvisorId: z.string().uuid('Invalid service advisor ID'),
    notes: z.string().max(1000).optional(),
  }).strict(),
});

export const updateReceiptSchema = z.object({
  body: z.object({
    amount: amount.optional(),
    narration: z.string().max(1000).optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'Amount or narration is required'),
  params: z.object({ id: z.string().uuid('Invalid receipt ID') }),
});

export const cancelDocumentSchema = z.object({
  body: z.object({ remark: z.string().trim().min(1).max(1000) }).strict(),
  params: z.object({ id: z.string().uuid() }),
});

export const receiptRegisterQuerySchema = z.object({
  query: z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    category: z.enum(['ALL', 'SERVICE_PARTS', 'SALES_ENQUIRY']).default('ALL'),
    branchId: z.string().uuid().optional(),
  }).refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'], message: 'The end date must be on or after the start date',
  }),
});

export const tallyDocumentsQuerySchema = z.object({
  query: z.object({
    date: z.string().date(),
    type: z.enum(['JOB_BILL', 'RECEIPT']),
  }),
});

export const importTallyLedgersSchema = z.object({
  body: z.object({
    ledgers: z.array(z.object({
      code: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(300),
    }).strict()).min(1).max(10000),
  }).strict(),
});

export const saveTallyMappingsSchema = z.object({
  body: z.object({
    mappings: z.array(z.object({
      documentType: z.enum(['JOB_BILL', 'RECEIPT']),
      accountType: z.string().trim().min(1).max(50),
      tallyLedgerCode: z.string().trim().min(1).max(100),
      tallyLedgerName: z.string().trim().min(1).max(300),
    }).strict()).min(1).max(100),
  }).strict(),
});

export const exportTallyBatchSchema = z.object({
  body: z.object({
    documents: z.array(z.object({
      type: z.enum(['JOB_BILL', 'RECEIPT']),
      id: z.string().uuid(),
    }).strict()).min(1).max(500),
  }).strict(),
});

export const confirmTallyBatchSchema = z.object({
  body: z.object({
    batchId: z.string().uuid(),
    documents: z.array(z.object({
      type: z.enum(['JOB_BILL', 'RECEIPT']),
      id: z.string().uuid(),
      voucherNumber: z.string().trim().min(1).max(100),
    }).strict()).min(1).max(500),
  }).strict(),
});

export const tallyLedgerSearchSchema = z.object({
  query: z.object({ search: z.string().trim().min(1).max(100).optional() }),
});

export const reportQuerySchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});
