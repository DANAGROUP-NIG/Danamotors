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
    scheduledAt: z.string().datetime('Invalid scheduled date'),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  }),
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    scheduledAt: z.string().datetime('Invalid scheduled date').optional(),
    durationMins: z.number().int().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
  }),
  params: z.object({
    id: z.string().uuid('Invalid appointment ID'),
  }),
});

export const createJobCardSchema = z.object({
  body: z.object({
    appointmentId: z.string().uuid('Invalid appointment ID').optional(),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    vehicleId: z.string().uuid('Invalid vehicle ID').optional(),
    branchName: z.string().min(1, 'Branch name is required'),
    jobNumber: z.string().min(1, 'Job number is required'),
    description: z.string().min(1, 'Description is required'),
    status: z.string().optional(),
    estimatedHours: z.number().optional(),
    estimatedCost: z.number().optional(),
    assignedTo: z.string().optional(),
  }),
});

export const updateJobCardSchema = z.object({
  body: z.object({
    appointmentId: z.string().uuid('Invalid appointment ID').optional(),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    vehicleId: z.string().uuid('Invalid vehicle ID').optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    estimatedHours: z.number().optional(),
    estimatedCost: z.number().optional(),
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
