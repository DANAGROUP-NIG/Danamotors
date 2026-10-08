import { BookingStatus } from '@prisma/client';
import { bookingStatusFor } from '../service/booking-status';
import { mileageBandProblem, saveSettingsSchema } from './settings';

const band = (fromKm: number, toKm: number | null, label = `${fromKm}`) => ({ fromKm, toKm, label, active: true });

describe('mileageBandProblem', () => {
  it('accepts ascending, non-overlapping bands with an open-ended last band', () => {
    expect(mileageBandProblem([band(0, 1000), band(1001, 5000), band(5001, null)])).toBeNull();
    expect(mileageBandProblem([band(0, 1000), band(2000, 3000)])).toBeNull();
  });

  it('rejects overlaps, reversed bands, out-of-order bands and an open band before the end', () => {
    expect(mileageBandProblem([band(0, 1000, 'A'), band(1000, 5000, 'B')])).toBe('Band 2 (B) overlaps with A');
    expect(mileageBandProblem([band(500, 100, 'A')])).toBe('Band 1 (A): "to" must be at least "from"');
    expect(mileageBandProblem([band(0, null, 'A'), band(1000, 2000, 'B')])).toBe('Band 1 (A): only the last band can be open-ended');
    expect(mileageBandProblem([band(5000, 6000, 'A'), band(0, 100, 'B')])).toBe('Band 2 (B) overlaps with A');
  });

  it('validates the request body', () => {
    expect(saveSettingsSchema.safeParse({ body: {} }).success).toBe(false);
    expect(saveSettingsSchema.safeParse({ body: { dueSoonHours: 73 } }).success).toBe(false);
    expect(saveSettingsSchema.safeParse({ body: { dueSoonHours: 4 } }).success).toBe(true);
    expect(saveSettingsSchema.safeParse({ body: { mileageBands: [band(0, 1000)] } }).success).toBe(true);
  });
});

describe('bookingStatusFor', () => {
  it('maps the appointment status to the booking status', () => {
    expect(bookingStatusFor('Pending')).toBe(BookingStatus.BOOKED);
    expect(bookingStatusFor('Checked In')).toBe(BookingStatus.BOOKED);
    expect(bookingStatusFor('Cancelled')).toBe(BookingStatus.CANCELLED);
    expect(bookingStatusFor('No Show')).toBe(BookingStatus.NO_SHOW);
    expect(bookingStatusFor('no-show')).toBe(BookingStatus.NO_SHOW);
  });

  it('never undoes a conversion', () => {
    expect(bookingStatusFor('Cancelled', BookingStatus.CONVERTED)).toBe(BookingStatus.CONVERTED);
  });
});
