jest.mock('../../prisma/client', () => ({ __esModule: true, default: { branchSettings: { findUnique: jest.fn() } } }));
import prisma from '../../prisma/client';
import { calculateJobBillTotals } from '../finance/job-bill-calculator';
import { repeatCandidateWhere } from '../service/job-card-workflow.service';
import { assertWithinBookingHorizon } from '../service/service.service';
import { branchSettingsSchema, defaultBranchSettings } from './company-settings.service';

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

it('treats a previous job within the days or within the km as a repeat candidate', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  expect(repeatCandidateWhere({ repeatWindowDays: 45, repeatWindowKm: 4000 }, 52000, now)).toEqual({ OR: [
    { createdAt: { gte: new Date('2026-08-31T00:00:00Z') } },
    { mileage: { gte: 48000, lte: 52000 } },
  ] });
  expect(repeatCandidateWhere({ repeatWindowDays: 30, repeatWindowKm: null }, 52000, now).OR).toHaveLength(1);
  expect(repeatCandidateWhere({ repeatWindowDays: 30, repeatWindowKm: 1500 }, undefined, now).OR).toHaveLength(1);
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
