import { z } from 'zod';

const date = z.string().datetime({ offset: true });
const amount = z.number().finite().positive().max(1e12).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, 'Use at most two decimal places');
const selection = z.object({ id: z.string().uuid(), kind: z.enum(['INVOICE', 'RECEIPT', 'NOTE']), amount });
export const partyDocumentsSchema = z.object({ params: z.object({ customerId: z.string().uuid() }), query: z.object({
  branchId: z.string().uuid().optional(), side: z.enum(['DEBIT','CREDIT']).default('DEBIT'),
  openOnly: z.enum(['true','false']).default('true'), page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25),
}) });
export const partyAccountSchema = z.object({ params: z.object({ customerId: z.string().uuid() }), query: z.object({ branchId: z.string().uuid().optional() }) });
export const fifoAdjustmentSchema = z.object({ body: z.object({ customerId: z.string().uuid(), branchId: z.string().uuid(), date }) });
export const createAdjustmentSchema = z.object({ body: z.object({
  customerId: z.string().uuid(), branchId: z.string().uuid(), date, source: z.enum(['ADVANCE_ADJUSTMENT','FIFO']).default('ADVANCE_ADJUSTMENT'),
  idempotencyKey: z.string().uuid(), debits: z.array(selection).min(1).max(200), credits: z.array(selection).min(1).max(200),
}) });
export const reverseAdjustmentSchema = z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ remark: z.string().trim().min(1).max(1000) }) });
export const openingBalanceSchema = z.object({ body: z.object({
  customerId: z.string().uuid(), branchId: z.string().uuid(), direction: z.enum(['DEBIT','CREDIT']), date,
  amount, narration: z.string().trim().min(1).max(2000), idempotencyKey: z.string().uuid(),
}) });
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>['body'];
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>['body'];

export const partySearchSchema = z.object({ query: z.object({ branchId: z.string().uuid().optional(), order: z.enum(["name","code"]).default("name"), search: z.string().trim().max(100).default(""), limit: z.coerce.number().int().min(1).max(100).default(50) }) });
