import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const createEnquirySchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(60, 'First name is too long'),

  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(60, 'Last name is too long'),

  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),

  phoneNumber: z
    .string()
    .min(7, 'Phone number is too short')
    .max(20, 'Phone number is too long')
    .regex(/^\+?[0-9\s\-()]+$/, 'Enter a valid phone number'),

  vehicleMake: z.string().max(50).optional(),

  vehicleModel: z.string().max(50).optional(),

  vehicleYear: z
    .number({ invalid_type_error: 'Enter a valid year' })
    .int()
    .min(1900, 'Year must be 1900 or later')
    .max(currentYear + 1, `Year cannot be later than ${currentYear + 1}`)
    .optional(),

  vehicleRegNumber: z.string().max(20).optional(),

  serviceDescription: z
    .string()
    .min(10, 'Please describe the service you need (at least 10 characters)')
    .max(500, 'Description is too long (max 500 characters)'),

  preferredDate: z.string().optional(),  // ISO string from date picker

  branchId: z.string().uuid('Please select a branch'),
});

export type CreateEnquiryFormValues = z.infer<typeof createEnquirySchema>;