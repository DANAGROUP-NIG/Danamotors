import { allocationBody } from "../service/job-diagnosis.logic";
import { z } from "zod";

export const receivePartsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      confirmed: z.literal(true),
      signatureImage: z.string().max(88000),
    })
    .strict(),
});

export const assignTechnicianSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid job card ID"),
  }),
  body: allocationBody,
});

