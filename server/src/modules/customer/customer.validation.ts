import { z } from 'zod';

export const customerIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});

export const customerTallyLedgerSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),

  body: z.object({
    tallyLedgerCode: z.string().trim().min(1).max(100).nullable(),
  }).strict(),
});

export const customerBody = z.object({
  firstName: z.string().trim().max(100).default(''),
  lastName: z.string().trim().max(100).default(''),
  email: z.preprocess(v => v === '' ? null : v, z.string().trim().toLowerCase().email().nullable().optional()),
  phoneNumber: z.string().trim().min(1).max(30),
  code: z.string().trim().min(1).max(50).optional(),
  partyStatus: z.enum(['CUSTOMER','DEALER','FA_PARTY']).optional(),
  type: z.enum(['INDIVIDUAL', 'CORPORATE', 'GOVERNMENT', 'VENDOR']).default('INDIVIDUAL'),
  salutation: z.enum(['Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Chief', 'M/S.']).nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  contactPerson: z.string().trim().max(200).nullable().optional(),
  registeredName: z.string().trim().max(200).nullable().optional(),
  mobile2: z.string().trim().max(30).nullable().optional(),
  office1: z.string().trim().max(30).nullable().optional(),
  office2: z.string().trim().max(30).nullable().optional(),
  house: z.string().trim().max(200).nullable().optional(),
  street: z.string().trim().max(200).nullable().optional(),
  zone: z.string().trim().max(100).nullable().optional(),
  tallyPartyCode: z.string().trim().max(100).nullable().optional(),
  dateOfBirth: z.string().datetime().optional(),
  driverLicenseNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  residencePhone: z.string().trim().max(30).nullable().optional(),
  fax: z.string().trim().max(30).nullable().optional(),
  stdCode: z.string().trim().max(10).nullable().optional(),
  vip: z.boolean().optional(),
  anniversaryDate: z.string().date().nullable().optional(),
  preferredFollowupDay: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']).nullable().optional(),
  preferredFollowupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  preferredContactMethod: z.string().optional(),
  branchId: z.string().uuid(),
}).strict();

export function validateCustomerIdentity(
  data: {
    type: string;
    firstName: string;
    lastName: string;
    companyName?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.type === 'INDIVIDUAL' && (!data.firstName || !data.lastName)) ctx.addIssue({
    code: 'custom',
    path: ['firstName'],
    message: 'Individuals require first and last names',
  });

  if (data.type !== 'INDIVIDUAL' && !data.companyName) ctx.addIssue({
    code: 'custom',
    path: ['companyName'],
    message: 'Company name is required',
  });
}

export const createCustomerSchema = z.object({
  body: customerBody.superRefine(validateCustomerIdentity),
});

export const updateCustomerSchema = z.object({
  body: customerBody.partial(),

  params: z.object({
    id: z.string().uuid(),
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

export const customerAccountSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),

  body: z.object({
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    isActive: z.boolean().optional(),
  }),
});

export const listCustomerSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(1000).default(10),
    search: z.string().trim().max(100).optional(),
    branchId: z.string().uuid().optional(),
  }),
});
