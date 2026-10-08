import { z } from "zod";

export const customerFields = z.object({
  firstName: z.string().trim(),
  lastName: z.string().trim(),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional(),
  phoneNumber: z.string().trim().min(1, "Mobile is required"),
  branchId: z.string().min(1, "Home branch is required"),
  partyStatus: z.enum(["CUSTOMER","DEALER","FA_PARTY"]).optional(),
  type: z.enum(["INDIVIDUAL", "CORPORATE", "GOVERNMENT", "VENDOR"]).optional(),
  salutation: z.enum(["", "Mr.", "Mrs.", "Ms.", "Dr.", "Chief", "M/S."]).optional(),
  code: z.string().optional(),
  companyName: z.string().optional(),
  contactPerson: z.string().optional(),
  registeredName: z.string().optional(),
  mobile2: z.string().optional(),
  office1: z.string().optional(),
  office2: z.string().optional(),
  house: z.string().optional(),
  street: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zone: z.string().optional(),
  residencePhone: z.string().max(30).optional(),
  fax: z.string().max(30).optional(),
  stdCode: z.string().max(10).optional(),
  vip: z.boolean().optional(),
  dateOfBirth: z.union([z.string().date(), z.literal("")]).optional(),
  anniversaryDate: z.union([z.string().date(), z.literal("")]).optional(),
  preferredFollowupDay: z.enum(["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).optional(),
  preferredFollowupTime: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]).optional(),
  postalCode: z.string().optional(),
  tallyPartyCode: z.string().optional(),
});

export const createCustomerSchema = customerFields.superRefine((v, ctx) => {
  if ((!v.type || v.type === "INDIVIDUAL") && (!v.firstName || !v.lastName)) ctx.addIssue({
    code: "custom",
    path: ["firstName"],
    message: "Individuals require first and last names",
  });

  if (v.type && v.type !== "INDIVIDUAL" && !v.companyName?.trim()) ctx.addIssue({
    code: "custom",
    path: ["companyName"],
    message: "Company name is required",
  });
});

export const updateCustomerSchema = customerFields.partial();
export type CreateCustomerFormValues = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerFormValues = z.infer<typeof updateCustomerSchema>;
