import { z } from 'zod';

export const serviceIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid appointment ID'),
  }),
});

export const jobCardIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
});

export const estimateIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid estimate ID'),
  }),
});

export const createAppointmentSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    vehicleId: z.string().uuid('Invalid vehicle ID'),
    branchName: z.string().min(1, 'Branch name is required'),
    serviceId: z.string().uuid('Invalid service ID'),
    scheduledAt: z.string().datetime('Invalid scheduled date'),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    createdById: z.string().uuid('Invalid user ID').optional(),
  }),
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    scheduledAt: z.string().datetime('Invalid scheduled date').optional(),
    serviceId: z.string().uuid('Invalid service ID').optional(),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid appointment ID'),
  }),
});

export const jobCardStatus = z.enum(['Open', 'Pending', 'In Progress', 'On Hold', 'Quality Check', 'Ready', 'Completed', 'Closed', 'Cancelled']);
const jobCardDate = z.string().refine((value) => /^(\d{4}-\d{2}-\d{2})(T.*)?$/.test(value) && Number.isFinite(Date.parse(value)), 'Invalid date');
export const listJobCardsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
    branchId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    search: z.string().optional(),
    status: z.string().optional(),
    dateFrom: jobCardDate.optional(),
    dateTo: jobCardDate.optional(),
  }).refine((q) => !q.dateFrom || !q.dateTo || Date.parse(q.dateFrom) <= Date.parse(q.dateTo), 'Date range is reversed'),
});

export const createJobCardSchema = z.object({
  body: z.object({
    appointmentId: z.string().uuid('Invalid appointment ID').optional(),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    vehicleId: z.string().uuid('Invalid vehicle ID').optional(),
    branchName: z.string().min(1, 'Branch name is required'),
    jobNumber: z.string().trim().min(1, 'Job number is required'),
    description: z.string().trim().min(1, 'Description is required'),
    status: jobCardStatus.optional(),
    estimatedHours: z.number().nonnegative().optional(),
    estimatedCost: z.number().nonnegative().optional(),
    assignedTo: z.string().optional(),
  }),
});

export const updateJobCardSchema = z.object({
  body: z.object({
    appointmentId: z.string().uuid('Invalid appointment ID').optional(),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    vehicleId: z.string().uuid('Invalid vehicle ID').optional(),
    description: z.string().trim().min(1).optional(),
    status: jobCardStatus.optional(),
    estimatedHours: z.number().nonnegative().optional(),
    estimatedCost: z.number().nonnegative().optional(),
    assignedTo: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
});

export const createInspectionSchema = z.object({
  body: z.object({
    inspectorId: z.string().uuid('Invalid inspector ID').optional(),
    findings: z.string().min(1, 'Findings are required'),
    passed: z.boolean().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
});

export const createEstimateSchema = z.object({
  body: z.object({
    description: z.string().min(1, 'Description is required'),
    amount: z.number(),
    currency: z.string().optional(),
    status: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
});

export const createApprovalSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    approved: z.boolean().optional(),
    decisionDate: z.string().datetime().optional(),
    comments: z.string().optional(),
    status: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid estimate ID'),
  }),
});

export const labourLineIdParamSchema = z.object({
  params: z.object({ lineId: z.string().uuid('Invalid labour line ID') }),
});

export const createLabourItemSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1).max(50),
    description: z.string().trim().min(1).max(300),
    defaultHours: z.number().positive(),
    rate: z.number().nonnegative(),
  }).strict(),
});

export const updateLabourItemSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1).max(50).optional(),
    description: z.string().trim().min(1).max(300).optional(),
    defaultHours: z.number().positive().optional(),
    rate: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
  params: z.object({ id: z.string().uuid('Invalid labour item ID') }),
});

export const createJobCardLabourSchema = z.object({
  body: z.object({
    labourItemId: z.string().uuid('Invalid labour item ID'),
    hours: z.number().positive().optional(),
    rate: z.number().nonnegative().optional(),
    technicianId: z.string().uuid('Invalid technician ID').optional(),
  }).strict(),
  params: z.object({ id: z.string().uuid('Invalid job card ID') }),
});

export const updateJobCardLabourSchema = z.object({
  body: z.object({
    labourItemId: z.string().uuid('Invalid labour item ID').optional(),
    hours: z.number().positive().optional(),
    rate: z.number().nonnegative().optional(),
    technicianId: z.string().uuid('Invalid technician ID').nullable().optional(),
  }).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required'),
  params: z.object({ lineId: z.string().uuid('Invalid labour line ID') }),
});
