import { HandheldDocumentStatus, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type HandheldSource = { pickingListId: string } | { customerOrderId: string } | { mitId: string };

/**
 * Cancels the document still on a device for a source that has just changed on the web (picking list
 * dispatched or cancelled, CPO billed or released, MIT received or cancelled), so a stale device result
 * can never be uploaded over it. The picker's entries stay on the device; HHDC Link shows the remark.
 */
export async function cancelSentHandheldDocuments(
  tx: Tx,
  source: HandheldSource | HandheldSource[],
  remark: string,
  actorId?: string | null,
): Promise<number> {
  const sources = Array.isArray(source) ? source : [source];
  if (!sources.length) return 0;
  const result = await tx.handheldDocument.updateMany({
    where: { status: HandheldDocumentStatus.SENT, OR: sources },
    data: {
      status: HandheldDocumentStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: actorId ?? null,
      cancelRemark: remark,
    },
  });
  return result.count;
}
