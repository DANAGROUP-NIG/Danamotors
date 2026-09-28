import { Prisma } from '@prisma/client';

export async function nextDocumentNumber(
  transaction: Prisma.TransactionClient,
  type: 'JOB_BILL' | 'RECEIPT',
  date = new Date(),
): Promise<string> {
  const year = date.getUTCFullYear();
  const sequence = await transaction.documentSequence.upsert({
    where: { key: `${type}_${year}` },
    create: { key: `${type}_${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });

  return `${year}${String(sequence.value).padStart(6, '0')}`;
}