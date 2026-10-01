import { z } from 'zod';
import { MAX_MILEAGE } from '../warranty/warranty.logic';

const mileageField = z.number().int('Mileage must be a whole number').min(0, 'Mileage cannot be negative').max(MAX_MILEAGE);
const acknowledgementFields = {
  warrantyAcknowledged: z.boolean().optional(),
  acknowledgedCampaignIds: z.array(z.string().uuid('Invalid campaign ID')).max(50).optional(),
};

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
    // Odometer reading taken at check-in (status 'Checked In').
    mileage: mileageField.optional(),
    ...acknowledgementFields,
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
    // Required when the job card is for a vehicle (checked in the service, which may take the vehicle from the appointment).
    mileage: mileageField.optional(),
    odometerReplaced: z.boolean().optional(),
    odometerReplacedReason: z.string().trim().max(300).optional(),
    ...acknowledgementFields,
  }).refine((b) => !b.odometerReplaced || Boolean(b.odometerReplacedReason?.trim()), {
    message: 'Give a reason for the odometer replacement',
    path: ['odometerReplacedReason'],
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
