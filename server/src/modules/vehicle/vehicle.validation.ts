import { z } from 'zod';
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const date = z.coerce.date().nullable().optional();
const amount = z.number().min(0).max(1e12).nullable().optional();
const modelText = z.string().trim().transform(value => value.replace(/\s+/g, ' ')).pipe(z.string().max(80)).nullable().optional();

export const vehicleIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid vehicle ID'),
  }),
});

export const vehicleBody = z.object({
  customerId: z.string().uuid().nullable().optional(),
  vin: z.string().trim().toUpperCase().min(1).max(50),
  registrationNumber: z.string().trim().toUpperCase().max(50).nullable().optional().transform(v => v === '' ? null : v),
  catalogueId: z.string().uuid().nullable().optional(),
  colourId: z.string().uuid().nullable().optional(),
  modelId: z.string().uuid().nullable().optional(),
  generationId: z.string().uuid().nullable().optional(),
  engineId: z.string().uuid().nullable().optional(),
  // Warranty policy model (VehicleModel); separate from the catalog modelId above.
  vehicleModelId: z.string().uuid().nullable().optional(),
  customMake: modelText,
  customModel: modelText,
  color: z.string().trim().max(80).nullable().optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  engineNumber: z.string().trim().max(100).optional(),
  keyNumber: z.string().trim().max(100).optional(),
  pdiDone: z.boolean().optional(),
  pdiDate: z.string().datetime().nullable().optional(),
  saleDate: z.string().datetime().nullable().optional(),
  sellingDealer: z.string().trim().max(200).optional(),
  ownershipStatus: z.string().optional(),
  colourType: z.string().trim().max(20).nullable().optional(),
  parkedAt: z.enum(['SHOWROOM', 'STOCKYARD', 'SOLD']).nullable().optional(),
  purchaseAmount: amount,
  saleInvoiceNumber: text(50),
  saleInvoiceDate: date,
  saleAmount: amount,
  wcoNumber: text(50),
  wcoDate: date,
  principalInvoiceNumber: text(50),
  principalInvoiceDate: date,
  theft: z.boolean().optional(),
  manufactureMonth: z.number().int().min(1).max(12).nullable().optional(),
  manufactureYear: z.number().int().min(1900).max(2200).nullable().optional(),
  tyres: z.array(z.object({
    makeId: z.string().uuid().optional(),
    number: z.string().trim().toUpperCase().max(100).optional(),
  }).strict()).max(5).optional(),
  batteryMakeId: z.string().uuid().nullable().optional(),
  batteryNumber: text(100),
}).strict();

export const createVehicleSchema = z.object({
  body: vehicleBody.refine(data => !!data.modelId || !!data.customModel?.trim() || (!!data.catalogueId && !!data.colourId), 'Select a catalog model or enter a custom model'),
});

export const updateVehicleSchema = z.object({
  body: vehicleBody.omit({
    vin: true,
    customerId: true,
  }).partial(),

  params: z.object({
    id: z.string().uuid(),
  }),
});

export const createVehicleImageSchema = z.object({
  body: z.object({
    url: z.string().url('Invalid image URL'),
    type: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  }),

  params: z.object({
    id: z.string().uuid('Invalid vehicle ID'),
  }),
});

export const createVehicleOwnershipSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    ownershipType: z.string().optional(),
    purchaseDate: z.string().datetime('Invalid purchase date'),
    saleDate: z.string().datetime().optional(),
    status: z.string().optional(),
  }),

  params: z.object({
    id: z.string().uuid('Invalid vehicle ID'),
  }),
});

export const listVehicleSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(1000).default(10),
    search: z.string().trim().max(100).optional(),
    branchId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
  }),
});
