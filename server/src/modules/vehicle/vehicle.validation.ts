import { z } from 'zod';

export const vehicleIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid vehicle ID'),
  }),
});

export const createVehicleSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    vin: z.string().min(1, 'VIN is required'),
    registrationNumber: z
      .string()
      .trim()
      .max(50)
      .transform((v) => v.toUpperCase())
      .optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().optional(),
    trim: z.string().optional(),
    color: z.string().optional(),
    warrantyProvider: z.string().optional(),
    warrantyStatus: z.string().optional(),
    warrantyExpiresAt: z.string().datetime().optional(),
    ownershipStatus: z.string().optional(),
  }),
});

export const updateVehicleSchema = z.object({
  body: z.object({
    registrationNumber: z
      .string()
      .trim()
      .max(50)
      .transform((v) => v.toUpperCase())
      .optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().int().optional(),
    trim: z.string().optional(),
    color: z.string().optional(),
    warrantyProvider: z.string().optional(),
    warrantyStatus: z.string().optional(),
    warrantyExpiresAt: z.string().datetime().optional(),
    ownershipStatus: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid vehicle ID'),
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
