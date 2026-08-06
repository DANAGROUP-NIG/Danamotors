import { z } from 'zod';

export const customerIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});

export const createCustomerSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phoneNumber: z.string().optional(),
    dateOfBirth: z.string().datetime().optional(),
    driverLicenseNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    preferredContactMethod: z.string().optional(),
    branchId: z.string().uuid('Invalid branch ID'),
  }),
});

export const updateCustomerSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().optional(),
    dateOfBirth: z.string().datetime().optional(),
    driverLicenseNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    preferredContactMethod: z.string().optional(),
    branchId: z.string().uuid('Invalid branch ID').optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});

export const createCustomerDocumentSchema = z.object({
  body: z.object({
    type: z.string().min(1, 'Document type is required'),
    url: z.string().url('Invalid document URL'),
    metadata: z.record(z.any()).optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});

export const createServiceHistorySchema = z.object({
  body: z.object({
    serviceDate: z.string().datetime('Invalid service date'),
    description: z.string().min(1, 'Description is required'),
    vehicleInfo: z.string().optional(),
    status: z.string().min(1, 'Status is required'),
    amount: z.number().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});
