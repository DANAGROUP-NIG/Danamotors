import { z } from "zod";

const MONEY = /^\d{1,13}(\.\d{1,2})?$/;

/** Work done, engineer and service charge the workshop saves while the job is open. Findings are recorded in Diagnosis. */
export const workDoneSchema = z.object({
  serviceCharge: z
    .string()
    .trim()
    .regex(MONEY, "Enter the service charge in naira, 0 or more, with up to two decimal places."),
  engineerId: z.string(),
  workDone: z.string().max(10000, "Keep the work done to 10,000 characters or fewer."),
});
export type WorkDoneValues = z.infer<typeof workDoneSchema>;

/** Handing the vehicle over. A late delivery needs at least one reason, up to six. */
export function deliverySchema(late: boolean) {
  return z.object({
    deliveryAdvisorId: z.string().min(1, "Choose the delivery advisor who hands the vehicle over."),
    lateReasonIds: z
      .array(z.string())
      .max(6, "Choose up to six late-delivery reasons.")
      .refine((ids) => !late || ids.length > 0, "The promised time has passed. Choose at least one late-delivery reason."),
    lateRemarks: z.string().max(1000, "Keep the delay remark to 1,000 characters or fewer."),
    remarks: z.string().max(2000, "Keep the remarks to 2,000 characters or fewer."),
  });
}
export type DeliveryValues = z.infer<ReturnType<typeof deliverySchema>>;

/** Approving delivery before the bill is paid needs a written reason. */
export const creditApprovalSchema = z.object({
  remarks: z.string().trim().min(1, "Enter why delivery on credit is approved.").max(2000, "Keep the reason to 2,000 characters or fewer."),
});
export type CreditApprovalValues = z.infer<typeof creditApprovalSchema>;
