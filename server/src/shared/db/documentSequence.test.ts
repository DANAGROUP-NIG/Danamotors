import { Prisma } from '@prisma/client';
import { nextSequenceNumber } from './documentSequence';

it.each([
  ['2026-12-31T22:59:59Z', 2026],
  ['2026-12-31T23:00:00Z', 2027],
  ['2027-01-01T00:00:00Z', 2027],
])('allocates %s in the Lagos business year %s', async (timestamp, year) => {
  const upsert = jest.fn().mockResolvedValue({ value: 12 });
  const tx = { documentSequence: { upsert } } as unknown as Prisma.TransactionClient;
  await expect(nextSequenceNumber(tx, 'BOOKING_branch', new Date(timestamp)))
    .resolves.toBe(`${year}000012`);
  expect(upsert).toHaveBeenCalledWith({
    where: { key: `BOOKING_branch_${year}` },
    create: { key: `BOOKING_branch_${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });
});

it('keeps branch counters separate', async () => {
  const upsert = jest.fn().mockResolvedValue({ value: 1 });
  const tx = { documentSequence: { upsert } } as unknown as Prisma.TransactionClient;
  const at = new Date('2026-11-16T10:00:00Z');
  await nextSequenceNumber(tx, 'REQUISITION_branchA', at);
  await nextSequenceNumber(tx, 'REQUISITION_branchB', at);
  expect(upsert.mock.calls.map(([input]) => input.where.key))
    .toEqual(['REQUISITION_branchA_2026', 'REQUISITION_branchB_2026']);
});
