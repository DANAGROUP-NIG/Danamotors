import { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "../../modules/stock-transfer/stockTransfer.logic";

/**
 * Next number for a document type, in the legacy format `YYYY` + 6 digits.
 * Uses the shared DocumentSequence (key, value) table with an atomic upsert on the
 * key `<docType>_<year>` using the Africa/Lagos business year, so
 * concurrent callers inside transactions never receive the same number.
 */
export async function nextSequenceNumber(tx: Prisma.TransactionClient, docType: string, at = new Date()): Promise<string> {
  const year = Number(new Intl.DateTimeFormat('en', {
    timeZone: 'Africa/Lagos', year: 'numeric',
  }).format(at));
  const key = `${docType}_${year}`;
  const sequence = await tx.documentSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatDocumentNumber(year, sequence.value);
}
