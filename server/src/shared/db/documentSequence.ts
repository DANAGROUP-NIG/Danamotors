import { Prisma } from "@prisma/client";
import { formatDocumentNumber } from "../../modules/stock-transfer/stockTransfer.logic";

/**
 * Next number for a document type, in the legacy format `YYYY` + 6 digits.
 * Uses the shared DocumentSequence table with an upsert, so concurrent callers
 * inside transactions never receive the same number.
 */
export async function nextSequenceNumber(tx: Prisma.TransactionClient, docType: string, at = new Date()): Promise<string> {
  const year = at.getFullYear();
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "DocumentSequence" ("docType", "year", "lastValue", "updatedAt")
    VALUES (${docType}, ${year}, 1, NOW())
    ON CONFLICT ("docType", "year")
    DO UPDATE SET "lastValue" = "DocumentSequence"."lastValue" + 1, "updatedAt" = NOW()
    RETURNING "lastValue"`;
  return formatDocumentNumber(year, Number(rows[0].lastValue));
}
