import { z } from 'zod';
import { BadRequestError } from '../../shared/errors/appError';
import type { ReportDb } from './core/types';

export const DUE_SOON_KEY = 'progress.dueSoonHours';
export const DEFAULT_DUE_SOON_HOURS = 2;
export const MAX_DUE_SOON_HOURS = 72;

export interface MileageBandInput {
  fromKm: number;
  toKm: number | null;
  label: string;
  active: boolean;
}

export interface MileageBandRow extends MileageBandInput {
  id: string;
  sortOrder: number;
}

const band = z
  .object({
    fromKm: z.number().int().min(0).max(10_000_000),
    toKm: z.number().int().min(0).max(10_000_000).nullable(),
    label: z.string().trim().min(1).max(60),
    active: z.boolean().default(true),
  })
  .strict();

export const saveSettingsSchema = z.object({
  body: z
    .object({
      mileageBands: z.array(band).min(1).max(30).optional(),
      dueSoonHours: z.number().int().min(0).max(MAX_DUE_SOON_HOURS).optional(),
    })
    .strict()
    .refine((body) => body.mileageBands !== undefined || body.dueSoonHours !== undefined, 'Nothing to save'),
});

/**
 * Bands must be in ascending order, must not overlap, and only the last may be open-ended.
 * Returns the problem for the first bad band (1-based), or null when the list is valid.
 */
export function mileageBandProblem(bands: MileageBandInput[]): string | null {
  for (let index = 0; index < bands.length; index += 1) {
    const current = bands[index];
    const position = `Band ${index + 1} (${current.label})`;
    if (current.toKm !== null && current.toKm < current.fromKm) return `${position}: "to" must be at least "from"`;
    if (current.toKm === null && index !== bands.length - 1) return `${position}: only the last band can be open-ended`;
    const previous = bands[index - 1];
    if (previous && previous.toKm !== null && current.fromKm <= previous.toKm) return `${position} overlaps with ${previous.label}`;
    if (previous && current.fromKm < previous.fromKm) return `${position}: bands must be in ascending order`;
  }
  return null;
}

export async function getReportSettings(db: ReportDb) {
  const [bands, dueSoon] = await Promise.all([
    db.mileageBand.findMany({ orderBy: [{ sortOrder: 'asc' }, { fromKm: 'asc' }] }),
    db.reportSetting.findUnique({ where: { key: DUE_SOON_KEY } }),
  ]);
  return {
    mileageBands: bands.map(({ id, fromKm, toKm, label, active, sortOrder }) => ({ id, fromKm, toKm, label, active, sortOrder })),
    dueSoonHours: typeof dueSoon?.value === 'number' ? dueSoon.value : DEFAULT_DUE_SOON_HOURS,
  };
}

export async function getDueSoonHours(db: ReportDb): Promise<number> {
  const setting = await db.reportSetting.findUnique({ where: { key: DUE_SOON_KEY } });
  return typeof setting?.value === 'number' ? setting.value : DEFAULT_DUE_SOON_HOURS;
}

/** Active bands in order, for the mileage-wise report. */
export async function activeMileageBands(db: ReportDb): Promise<MileageBandRow[]> {
  return db.mileageBand.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { fromKm: 'asc' }] });
}

export async function saveReportSettings(db: ReportDb, input: z.infer<typeof saveSettingsSchema>['body'], userId: string) {
  if (input.mileageBands) {
    const problem = mileageBandProblem(input.mileageBands.filter((b) => b.active));
    if (problem) throw new BadRequestError(problem);
    // Bands are a small ordered list: replace them as a whole.
    await db.mileageBand.deleteMany({});
    await db.mileageBand.createMany({ data: input.mileageBands.map((b, index) => ({ ...b, sortOrder: index + 1 })) });
  }
  if (input.dueSoonHours !== undefined) {
    await db.reportSetting.upsert({
      where: { key: DUE_SOON_KEY },
      create: { key: DUE_SOON_KEY, value: input.dueSoonHours, updatedById: userId },
      update: { value: input.dueSoonHours, updatedById: userId },
    });
  }
  return getReportSettings(db);
}
