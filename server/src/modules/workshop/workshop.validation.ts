import { z } from 'zod';

export const jobCardIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
});

export const assignTechnicianSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
  body: z.object({
    technicianId: z.string().uuid('Invalid technician ID'),
    qualityInspectorId: z.string().uuid('Invalid quality inspector ID').optional(),
  }),
});

export const updateJobProgressSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
  body: z.object({
    progress: z.number().int().min(0).max(100),
    status: z.string().optional(),
  }),
});

export const qcUpdateSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid job card ID'),
  }),
  body: z.object({
    qcStatus: z.string().min(1, 'QC status is required'),
    qcNotes: z.string().optional(),
  }),
});
