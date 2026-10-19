import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../../config';
import prisma from '../../prisma/client';
import { NotFoundError } from '../../shared/errors/appError';

type Db = Prisma.TransactionClient;
const text = (max: number) => z.string().trim().max(max).nullable();

// Legacy Control Information: company-wide details printed on documents.
export const companyProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  tin: text(50),
  rcNumber: text(50),
  dealerCode: text(20),
}).strict();

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

const COMPANY_KEY = 'companyProfile';
const DEFAULT_COMPANY: CompanyProfile = { name: 'Dana Motors Limited', tin: null, rcNumber: null, dealerCode: null };

// Legacy Control Calculation and Workshop Information, which each legacy database set for its location.
export const branchSettingsSchema = z.object({
  labourVatPercent: z.number().min(0).max(100),
  roundOffValue: z.number().int().min(1).max(1000),
  repeatWindowDays: z.number().int().min(1).max(3650),
  repeatWindowKm: z.number().int().min(1).max(1_000_000).nullable(),
  bookingMaxDays: z.number().int().min(1).max(3650),
  contactPerson: text(100),
  shifts: z.number().int().min(1).max(5),
  workStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workingHours: z.number().positive().max(24),
  weeklyHoliday: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).nullable(),
  vorOrderDays: z.number().int().min(0).max(365),
  reorderMonths: z.number().int().min(1).max(60),
  courtLocation: text(100),
  reminderLetterDesignation: text(100),
  signatories: z.array(z.string().trim().min(1).max(100)).max(5),
}).strict();

export type BranchSettingsValues = z.infer<typeof branchSettingsSchema>;

// A branch without saved settings uses these; VAT and repeat days keep the old server settings.
export function defaultBranchSettings(): BranchSettingsValues {
  return {
    labourVatPercent: config.JOB_BILL_VAT_RATE,
    roundOffValue: 10,
    repeatWindowDays: Number(process.env.JOB_REPEAT_WINDOW_DAYS ?? 30),
    repeatWindowKm: 1500,
    bookingMaxDays: 30,
    contactPerson: null,
    shifts: 1,
    workStartTime: '07:30',
    workingHours: 10,
    weeklyHoliday: null,
    vorOrderDays: 7,
    reorderMonths: 3,
    courtLocation: null,
    reminderLetterDesignation: null,
    signatories: [],
  };
}

export async function getBranchSettings(branchId: string, db: Db = prisma): Promise<BranchSettingsValues> {
  const row = await db.branchSettings.findUnique({ where: { branchId } });
  if (!row)
    return defaultBranchSettings();
  const { branchId: _branchId, updatedAt: _updatedAt, ...values } = row;
  return values as BranchSettingsValues;
}

export async function getCompanyProfile(db: Db = prisma): Promise<CompanyProfile> {
  const row = await db.financeSetting.findUnique({ where: { key: COMPANY_KEY } });
  const parsed = companyProfileSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : DEFAULT_COMPANY;
}

export class CompanySettingsService {
  async saveCompany(profile: CompanyProfile) {
    await prisma.financeSetting.upsert({
      where: { key: COMPANY_KEY },
      create: { key: COMPANY_KEY, value: profile },
      update: { value: profile },
    });
    return profile;
  }

  async getBranch(branchId: string) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch)
      throw new NotFoundError('Branch not found');
    return getBranchSettings(branchId);
  }

  async saveBranch(branchId: string, values: BranchSettingsValues) {
    await this.getBranch(branchId);
    const { branchId: _branchId, updatedAt: _updatedAt, ...saved } = await prisma.branchSettings.upsert({
      where: { branchId },
      create: { branchId, ...values },
      update: values,
    });
    return saved;
  }
}
