jest.mock('../../prisma/client', () => ({ __esModule: true, default: { branchSettings: { findUnique: jest.fn() } } }));
import prisma from '../../prisma/client';
import { calculateJobBillTotals } from '../finance/job-bill-calculator';
import { assertWithinBookingHorizon } from '../service/service.service';
import { branchSettingsSchema, defaultBranchSettings, getBranchSettings } from './company-settings.service';

beforeEach(() => jest.resetAllMocks());

it('rounds a job bill down to the branch round-off value, as legacy did', () => {
  // Legacy bill: 113,205.20 before round-off, billed 113,200 with round-off -5.20.
  const totals = calculateJobBillTotals({ partsTotal: 91750, labourTotal: 19933.2, partsDiscountPercent: 0, labourDiscountPercent: 0, vatRate: 7.5, roundOffValue: 10 });
  expect(totals.total % 10).toBe(0);
  expect(totals.roundOff).toBeLessThanOrEqual(0);
  expect(totals.roundOff).toBeGreaterThan(-10);
  const exact = calculateJobBillTotals({ partsTotal: 1000, labourTotal: 0, partsDiscountPercent: 0, labourDiscountPercent: 0, vatRate: 7.5, roundOffValue: 10 });
  expect(exact).toMatchObject({ total: 1000, roundOff: 0 });
  expect(() => calculateJobBillTotals({ partsTotal: 1, labourTotal: 0, partsDiscountPercent: 0, labourDiscountPercent: 0, vatRate: 0, roundOffValue: 0 })).toThrow();
});

it('defaults a branch without settings to the legacy 15 days / 500 km repeat window with the print block on', () => {
  expect(defaultBranchSettings()).toMatchObject({ repeatWindowDays: 15, repeatWindowKm: 500, printRepeatBlock: true });
  // Saved settings from before the print option still validate (the option defaults on).
  const { printRepeatBlock: _printRepeatBlock, ...older } = defaultBranchSettings();
  expect(branchSettingsSchema.parse(older).printRepeatBlock).toBe(true);
});

it('limits bookings to the branch horizon', async () => {
  (prisma.branchSettings.findUnique as jest.Mock).mockResolvedValue({ ...defaultBranchSettings(), branchId: 'b', updatedAt: new Date(), bookingMaxDays: 30 });
  const now = new Date('2026-10-15T09:00:00');
  await expect(assertWithinBookingHorizon('b', new Date('2026-11-14T16:00:00'), now)).resolves.toBeUndefined();
  await expect(assertWithinBookingHorizon('b', new Date('2026-11-15T08:00:00'), now)).rejects.toMatchObject({ statusCode: 400 });
});

it('validates branch settings', () => {
  expect(branchSettingsSchema.safeParse(defaultBranchSettings()).success).toBe(true);
  expect(branchSettingsSchema.safeParse({ ...defaultBranchSettings(), workStartTime: '7:30' }).success).toBe(false);
  expect(branchSettingsSchema.safeParse({ ...defaultBranchSettings(), signatories: Array(6).fill('A') }).success).toBe(false);
});

it('keeps the workshop board step targets in whole minutes, naming the step in each message', () => {
  expect(defaultBranchSettings()).toMatchObject({
    stageTargetCheckInMinutes: 30,
    stageTargetDiagnosisMinutes: 120,
    stageTargetWarrantyMinutes: 120,
    stageTargetEstimateMinutes: 120,
    stageTargetQualityCheckMinutes: 60,
  });
  const messages = (values: Record<string, unknown>) => {
    const result = branchSettingsSchema.safeParse({ ...defaultBranchSettings(), ...values });
    return result.success ? [] : result.error.issues.map(issue => issue.message);
  };
  expect(messages({ stageTargetCheckInMinutes: 0 })).toEqual(['The check-in time target must be at least 1 minute']);
  expect(messages({ stageTargetDiagnosisMinutes: 90.5 })).toEqual(['Enter the diagnosis time target in whole minutes']);
  expect(messages({ stageTargetQualityCheckMinutes: 20_000 })).toEqual(['The quality check time target must be 10,080 minutes (7 days) or less']);
});

it('leaves the books-closed date out of the branch rules, so a saved branch can be saved again', async () => {
  (prisma.branchSettings.findUnique as jest.Mock).mockResolvedValue({ ...defaultBranchSettings(), branchId: 'b', updatedAt: new Date(), booksClosedUpTo: new Date('2026-10-31') });
  const settings = await getBranchSettings('b');
  expect(settings).not.toHaveProperty('booksClosedUpTo');
  expect(branchSettingsSchema.safeParse(settings).success).toBe(true);
});
