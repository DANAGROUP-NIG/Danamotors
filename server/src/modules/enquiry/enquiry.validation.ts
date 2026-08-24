import { z } from 'zod';

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

// ─── Walk-in Appointment (Staff — requires service:create) ───────────────────
// NOTE: This reuses the existing createAppointmentSchema shape but adds `source`.
// The `source` is forced to 'WalkIn' in the controller — not exposed to the client.
// No changes to the existing createAppointmentSchema are needed.

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
    // Required only when action === 'approve'
    // Staff must link the enquiry to a real customer & vehicle (or create them first)
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
