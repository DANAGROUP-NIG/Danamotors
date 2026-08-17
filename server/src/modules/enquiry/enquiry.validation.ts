import { z } from 'zod';

export const createEnquirySchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    email: z.string().email('Invalid email address'),
    phoneNumber: z.string().min(1, 'Phone number is required').max(20),
    vehicleMake: z.string().max(100).optional(),
    vehicleModel: z.string().max(100).optional(),
    vehicleYear: z.number().int().min(1900).max(2100).optional(),
    vehicleRegNumber: z.string().max(20).optional(),
    serviceDescription: z.string().min(1, 'Service description is required').max(1000),
    preferredDate: z.string().datetime('Invalid date format').optional(),
    branchId: z.string().uuid('Invalid branch ID'),
  }),
});

export const enquiryIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid enquiry ID'),
  }),
});

export const approveEnquirySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid enquiry ID'),
  }),
  body: z.object({
    reviewNotes: z.string().max(500).optional(),
  }),
});

export const rejectEnquirySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid enquiry ID'),
  }),
  body: z.object({
    reviewNotes: z.string().max(500).optional(),
  }),
});

export const listEnquiriesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(10),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'Converted']).optional(),
    branchId: z.string().uuid('Invalid branch ID').optional(),
    search: z.string().optional(),
  }),
});
