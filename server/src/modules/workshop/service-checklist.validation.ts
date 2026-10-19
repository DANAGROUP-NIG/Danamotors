import { z } from 'zod';

const id = z.string().uuid();
const quantity = z.number().positive().max(1e6);
const amount = z.number().min(0).max(1e12).multipleOf(0.01);

export const listChecklistLinesSchema = z.object({
  query: z.object({
    checklistId: id,
    modelId: id,
    // Omitted: the lines for all variants only.
    variantId: id.optional(),
  }),
});

export const createChecklistLineSchema = z.object({
  body: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('PART'),
      checklistId: id,
      modelId: id,
      variantId: id.nullable().optional(),
      sparePartId: id,
      quantity,
    }).strict(),
    z.object({
      kind: z.literal('LABOUR'),
      checklistId: id,
      modelId: id,
      variantId: id.nullable().optional(),
      labourItemId: id,
      amount,
    }).strict(),
  ]),
});

export const updateChecklistLineSchema = z.object({
  params: z.object({
    id,
  }),

  body: z.object({
    quantity: quantity.optional(),
    amount: amount.optional(),
  }).strict(),
});

export const listChecklistMileagesSchema = z.object({
  query: z.object({
    modelId: id,
    variantId: id.optional(),
  }),
});

export const createChecklistMileageSchema = z.object({
  body: z.object({
    modelId: id,
    variantId: id.nullable().optional(),
    mileage: z.number().int().positive().max(10_000_000),
    checklistId: id,
  }).strict(),
});

export const checklistIdParamSchema = z.object({
  params: z.object({
    id,
  }),
});

export type CreateChecklistLine = z.infer<typeof createChecklistLineSchema>['body'];
export type CreateChecklistMileage = z.infer<typeof createChecklistMileageSchema>['body'];
