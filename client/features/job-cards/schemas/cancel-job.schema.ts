import { z } from "zod";

/** The reason a job is cancelled. It is shown on the cancelled job and kept in the audit trail. */
export const cancelJobSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Enter the reason for cancelling this job.")
    .max(2000, "Keep the reason to 2,000 characters or fewer."),
});

export type CancelJobValues = z.infer<typeof cancelJobSchema>;
