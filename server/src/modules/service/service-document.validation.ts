import { z } from 'zod';
export const serviceDocumentIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
export const serviceRemarksSchema = serviceDocumentIdSchema.extend({ body: z.object({ remarks: z.string().trim().max(5000).nullable() }).strict() });
