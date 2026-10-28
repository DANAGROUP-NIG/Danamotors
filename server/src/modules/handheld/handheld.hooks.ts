import { HandheldDocumentStatus, Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type HandheldSource = { pickingListId: string } | { customerOrderId: string } | { mitId: string } | { stockTakeSheetId: string };

/** Jobs not yet posted: waiting for a handheld, on one, or finished and waiting to be posted. */
export const ACTIVE_HANDHELD_STATUSES: HandheldDocumentStatus[] = [
  HandheldDocumentStatus.QUEUED,
  HandheldDocumentStatus.SENT,
  HandheldDocumentStatus.RECEIVED,
];

/**
 * Cancels the active handheld job of a source that has just changed on the web (picking list dispatched
 * or cancelled, CPO billed or released, MIT received or cancelled, count sheet cancelled or uploaded
 * directly), so a stale device result can never be posted over it. The picker's entries stay on the
 * device; the station removes the file at the next dock only if nothing was entered.
 *
 * Returns the ids of the cancelled jobs. The handheld sweep tells their senders once this commits.
 */
export async function cancelSentHandheldDocuments(
  tx: Tx,
  source: HandheldSource | HandheldSource[],
  remark: string,
  actorId?: string | null,
): Promise<string[]> {
  const sources = Array.isArray(source) ? source : [source];
  if (!sources.length) return [];
  const where = { status: { in: ACTIVE_HANDHELD_STATUSES }, OR: sources };
  const jobs = await tx.handheldDocument.findMany({ where, select: { id: true } });
  if (!jobs.length) return [];
  await tx.handheldDocument.updateMany({
    where: { ...where, id: { in: jobs.map((j) => j.id) } },
    data: {
      status: HandheldDocumentStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: actorId ?? null,
      cancelRemark: remark,
      claimStationId: null,
      claimDeviceId: null,
      claimExpiresAt: null,
    },
  });
  return jobs.map((j) => j.id);
}
