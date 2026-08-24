import { z } from 'zod';

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
    jobCardId: z.string().uuid('Invalid job card ID').optional(),
    invoiceNumber: z.string().min(1, 'Invoice number is required'),
    issuedDate: z.string().datetime().optional(),
    dueDate: z.string().datetime().optional(),
    subtotal: z.number().nonnegative('Subtotal must be non-negative'),
    tax: z.number().nonnegative('Tax must be non-negative').optional(),
    total: z.number().nonnegative('Total must be non-negative'),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    dueDate: z.string().datetime().optional(),
    subtotal: z.number().nonnegative().optional(),
    tax: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),
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
    invoiceId: z.string().uuid('Invalid invoice ID'),
    // Optional: the controller always overrides this with the authenticated user.
    issuedById: z.string().uuid('Invalid user ID').optional(),
    amount: z.number().positive('Receipt amount must be positive'),
    issuedAt: z.string().datetime().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const reportQuerySchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});
