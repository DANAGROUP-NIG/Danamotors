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
  // Terms clause 4: the estimation charge when a customer declines all work (larger of the two).
  estimationChargeMinimum: z.number({ invalid_type_error: 'Enter the minimum estimation charge as a number' }).min(0, 'The minimum estimation charge cannot be negative').max(10_000_000, 'The minimum estimation charge must be 10,000,000 or less').multipleOf(0.01, 'Use at most 2 decimal places for the minimum estimation charge'),
  estimationChargePercent: z.number({ invalid_type_error: 'Enter the estimation charge percentage as a number' }).min(0, 'The estimation charge percentage must be between 0 and 100').max(100, 'The estimation charge percentage must be between 0 and 100').multipleOf(0.01, 'Use at most 2 decimal places for the estimation charge percentage'),
  // Terms clause 3: storage is free for these hours after the customer is told the vehicle is ready.
  storageFreeHours: z.number({ invalid_type_error: 'Enter the free storage hours as a whole number' }).int('Enter the free storage hours as a whole number').min(0, 'The free storage hours cannot be negative').max(720, 'The free storage hours must be 720 or less'),
  storageDailyRate: z.number({ invalid_type_error: 'Enter the storage charge per day as a number' }).min(0, 'The storage charge per day cannot be negative').max(1_000_000, 'The storage charge per day must be 1,000,000 or less').multipleOf(0.01, 'Use at most 2 decimal places for the storage charge per day'),
  // Delivery (job card revamp phase 9): the follow-up call is due this many days after delivery.
  psfFollowUpDays: z.number({ invalid_type_error: 'Enter the follow-up call days as a whole number' }).int('Enter the follow-up call days as a whole number').min(0, 'The follow-up call days cannot be negative').max(60, 'The follow-up call days must be 60 or less'),
  repeatWindowDays: z.number().int().min(1).max(3650),
  repeatWindowKm: z.number().int().min(1).max(1_000_000).nullable(),
  printRepeatBlock: z.boolean().default(true),
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

// A branch without saved settings uses these; VAT and repeat days keep the old server settings
// (JOB_REPEAT_WINDOW_DAYS), otherwise the legacy main-branch window of 15 days / 500 km.
export function defaultBranchSettings(): BranchSettingsValues {
  return {
    labourVatPercent: config.JOB_BILL_VAT_RATE,
    roundOffValue: 10,
    estimationChargeMinimum: 25000,
    estimationChargePercent: 10,
    // TODO(confirm): terms clause 3 (48 hours free, then ₦2,000.00 a day) for every branch until each sets its own.
    storageFreeHours: 48,
    storageDailyRate: 2000,
    // TODO(confirm): the follow-up call two days after delivery, as in the design, until each branch sets its own.
    psfFollowUpDays: 2,
    repeatWindowDays: Number(process.env.JOB_REPEAT_WINDOW_DAYS ?? 15),
    repeatWindowKm: 500,
    printRepeatBlock: true,
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
  const { branchId: _branchId, updatedAt: _updatedAt, estimationChargeMinimum, estimationChargePercent, storageDailyRate, ...values } = row;
  return {
    ...values,
    estimationChargeMinimum: Number(estimationChargeMinimum),
    estimationChargePercent: Number(estimationChargePercent),
    storageDailyRate: Number(storageDailyRate),
  } as BranchSettingsValues;
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

  /** Saves a branch's rules; every change is audited with the values before and after. */
  async saveBranch(branchId: string, values: BranchSettingsValues, actorId?: string) {
    const before = await this.getBranch(branchId);
    return prisma.$transaction(async (tx) => {
      const { branchId: _branchId, updatedAt: _updatedAt, ...saved } = await tx.branchSettings.upsert({
        where: { branchId },
        create: { branchId, ...values },
        update: values,
      });
      await tx.auditLog.create({ data: { userId: actorId ?? null, action: 'BRANCH_SETTINGS_UPDATED', details: JSON.stringify({ branchId, before, after: saved }) } });
      // Money and percentages are stored as Decimal; the screen works in numbers.
      return {
        ...saved,
        estimationChargeMinimum: Number(saved.estimationChargeMinimum),
        estimationChargePercent: Number(saved.estimationChargePercent),
        storageDailyRate: Number(saved.storageDailyRate),
      };
    });
  }
}
