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

/** Approving delivery before the bill is paid needs a written reason. */
export const creditApprovalSchema = z.object({
  remarks: z.string().trim().min(1, "Enter why delivery on credit is approved.").max(2000, "Keep the reason to 2,000 characters or fewer."),
});
export type CreditApprovalValues = z.infer<typeof creditApprovalSchema>;
