import { Prisma } from '@prisma/client';

export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  type: 'JOB_BILL' | 'RECEIPT' | 'JOB_CARD' | 'GATE_PASS',
  date = new Date(),
): Promise<string> {
  const year = date.getUTCFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: { key: `${type}_${year}` },
    create: { key: `${type}_${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  if (sequence.value > 999999) throw new Error('Annual document sequence exhausted');
  return `${year}${String(sequence.value).padStart(6, '0')}`;
}