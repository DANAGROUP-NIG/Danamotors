import { z } from "zod";

export const portalProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9\s\-()]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  preferredContactMethod: z.string().optional().or(z.literal("")),
});

export type PortalProfileFormValues = z.infer<typeof portalProfileSchema>;

export const portalPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type PortalPasswordFormValues = z.infer<typeof portalPasswordSchema>;

export const registerPortalVehicleSchema = z.object({
  vin: z
    .string()
    .min(1, "VIN is required")
    .refine((v) => v.length >= 11, "Enter a valid VIN (at least 11 characters)"),
  registrationNumber: z
    .string()
    .trim()
    .max(50, "Max 50 characters")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  make: z.string().optional().or(z.literal("")),
  model: z.string().optional().or(z.literal("")),
  year: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 1950 && Number(v) <= new Date().getFullYear() + 1),
      "Enter a valid year",
    ),
  trim: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
});

export type RegisterPortalVehicleFormValues = z.infer<typeof registerPortalVehicleSchema>;

export const bookPortalAppointmentSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  serviceId: z.string().min(1, "Select a service"),
  scheduledAt: z.string().min(1, "Choose a date and time"),
  durationMins: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || (Number.isInteger(Number(v)) && Number(v) > 0), "Enter a positive number"),
  notes: z.string().optional().or(z.literal("")),
});

export type BookPortalAppointmentFormValues = z.infer<typeof bookPortalAppointmentSchema>;
