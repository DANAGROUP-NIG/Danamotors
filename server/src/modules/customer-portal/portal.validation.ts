import { z } from "zod";

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "ID is required"),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, "First name is required").optional(),
    lastName: z.string().min(1, "Last name is required").optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    preferredContactMethod: z.string().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(6, "New password must be at least 6 characters long"),
  }),
});

export const estimateApprovalSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Estimate ID is required"),
  }),
  body: z.object({
    approved: z.boolean(),
    comments: z.string().optional(),
  }),
});

export const jobCardListQuerySchema = z.object({
  query: z.object({
    status: z.string().optional(),
    vehicleId: z.string().optional(),
  }),
});

export const createPortalVehicleSchema = z.object({
  body: z.object({
    vin: z.string().min(1, "VIN is required"),
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
    warrantyStatus: z.string().optional(),
    ownershipStatus: z.string().optional(),
  }),
});

export const createPortalAppointmentSchema = z.object({
  body: z.object({
    vehicleId: z.string().min(1, "Vehicle is required"),
    serviceId: z.string().min(1, "Service is required"),
    scheduledAt: z.string().datetime("Invalid scheduled date"),
    durationMins: z.number().int().positive().optional(),
    notes: z.string().optional(),
  }),
});

export const creditDecisionSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Credit application ID is required"),
  }),
  body: z.object({
    approved: z.boolean(),
    comments: z.string().optional(),
  }),
});
