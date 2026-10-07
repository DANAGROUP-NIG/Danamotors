import { Prisma } from '@prisma/client';

// Bookings carry a prefix so their numbers are never mistaken for job or bill numbers.
const PREFIX: Partial<Record<DocumentType, string>> = { BOOKING: 'BK' };

export type DocumentType = 'JOB_BILL' | 'RECEIPT' | 'JOB_CARD' | 'GATE_PASS' | 'BOOKING';

export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  type: DocumentType,
  date = new Date(),
): Promise<string> {
  const year = date.getUTCFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: { key: `${type}_${year}` },
    create: { key: `${type}_${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  if (sequence.value > 999999) throw new Error('Annual document sequence exhausted');
  return `${PREFIX[type] ?? ''}${year}${String(sequence.value).padStart(6, '0')}`;
}