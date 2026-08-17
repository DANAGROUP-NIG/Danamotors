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
    source: z.enum(['WalkIn', 'OnlineBooking']).optional().default('WalkIn'),
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

// ─── Online Enquiry (Public — no auth) ───────────────────────────────────────
export const createEnquirySchema = z.object({
  body: z.object({
    firstName:          z.string().min(1, 'First name is required').max(60),
    lastName:           z.string().min(1, 'Last name is required').max(60),
    email:              z.string().email('A valid email is required'),
    phoneNumber:        z.string().min(7, 'Phone number is required').max(20)
                          .regex(/^\+?[0-9\s\-()]+$/, 'Invalid phone number'),
    vehicleMake:        z.string().max(50).optional(),
    vehicleModel:       z.string().max(50).optional(),
    vehicleYear:        z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
    vehicleRegNumber:   z.string().max(20).optional(),
    serviceDescription: z.string().min(10, 'Please describe the service needed').max(500),
    preferredDate:      z.string().datetime({ offset: true }).optional(),
    branchId:           z.string().uuid('Invalid branch ID'),
  }),
});

export type CreateEnquiryBody = z.infer<typeof createEnquirySchema>['body'];

// ─── Approve / Reject Enquiry (Staff — requires service:update) ─────────────
export const reviewEnquirySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid enquiry ID'),
  }),
  body: z.object({
    action:        z.enum(['approve', 'reject'], {
                     required_error: 'Action must be approve or reject',
                   }),
    reviewNotes:   z.string().max(500).optional(),
    customerId:    z.string().uuid('Invalid customer ID').optional(),
    vehicleId:     z.string().uuid('Invalid vehicle ID').optional(),
    scheduledAt:   z.string().datetime({ offset: true }).optional(),
    serviceId:     z.string().uuid().optional(),
    durationMins:  z.number().int().positive().optional(),
    notes:         z.string().max(500).optional(),
  }).superRefine((data, ctx) => {
    if (data.action === 'approve') {
      if (!data.customerId) {
        ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'Customer ID is required to approve' });
      }
      if (!data.vehicleId) {
        ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Vehicle ID is required to approve' });
      }
      if (!data.scheduledAt) {
        ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Scheduled date is required to approve' });
      }
    }
  }),
});

export type ReviewEnquiryBody = z.infer<typeof reviewEnquirySchema>['body'];

// ─── List Enquiries ──────────────────────────────────────────────────────────
export const listEnquiriesQuerySchema = z.object({
  query: z.object({
    page:     z.coerce.number().int().positive().default(1),
    limit:    z.coerce.number().int().positive().max(100).default(10),
    branchId: z.string().uuid().optional(),
    status:   z.enum(['Pending', 'Approved', 'Rejected', 'Converted']).optional(),
    search:   z.string().max(100).optional(),
    dateFrom: z.string().datetime({ offset: true }).optional(),
    dateTo:   z.string().datetime({ offset: true }).optional(),
  }),
});

// ─── Enquiry ID param ────────────────────────────────────────────────────────
export const enquiryIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid enquiry ID'),
  }),
});
