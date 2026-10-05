import { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "../../modules/stock-transfer/stockTransfer.logic";

/**
 * Next number for a document type, in the legacy format `YYYY` + 6 digits.
 * Uses the shared DocumentSequence (key, value) table with an atomic upsert on the
 * key `<docType>_<year>`, the same convention as finance/document-number.ts, so
 * concurrent callers inside transactions never receive the same number.
 */
export async function nextSequenceNumber(tx: Prisma.TransactionClient, docType: string, at = new Date()): Promise<string> {
  const year = at.getFullYear();
  const key = `${docType}_${year}`;
  const sequence = await tx.documentSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatDocumentNumber(year, sequence.value);
}
