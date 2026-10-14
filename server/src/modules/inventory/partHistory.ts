/**
 * Part rate and bin history (legacy PartRateHistory and PartBinHistory), written wherever a
 * part's rates or bins change, for the Part Rate History and Part Bin Location History reports.
 */
import { PartChangeAction, Prisma, SparePart } from "@prisma/client";

type Db = Prisma.TransactionClient;
type TrackedPart = Pick<SparePart, "id" | "partNumber" | "name" | "partFlag" | "priceCategoryCode" | "unitPrice" | "retailRate" | "binLocation">;

const bin = (value: string | null | undefined) => value?.trim() || null;

/**
 * Records a part being added (`before` null), edited, or deleted (`after` null): its rates when
 * they changed, and its Part Master bin when that changed.
 */
export async function recordPartChange(db: Db, before: TrackedPart | null, after: TrackedPart | null, changedById?: string | null) {
  const part = after ?? before;
  if (!part) return;
  const action = !before ? PartChangeAction.ADDED : !after ? PartChangeAction.DELETED : PartChangeAction.EDITED;
  const ratesChanged = before?.unitPrice !== after?.unitPrice || (before?.retailRate ?? null) !== (after?.retailRate ?? null);
  if (ratesChanged) {
    await db.partRateHistory.create({
      data: {
        partId: after?.id ?? null,
        partNumber: part.partNumber,
        description: part.name,
        partFlag: part.partFlag,
        priceCategoryCode: part.priceCategoryCode,
        action,
        oldDealerRate: before?.unitPrice ?? null,
        newDealerRate: after?.unitPrice ?? null,
        oldRetailRate: before?.retailRate ?? null,
        newRetailRate: after?.retailRate ?? null,
        changedById: changedById ?? null,
      },
    });
  }
  if (before && after) await recordBinChange(db, after.id, null, before.binLocation, after.binLocation, changedById);
}

/** Records a bin change: a branch's rack location, or the Part Master bin when `branchId` is null. */
export async function recordBinChange(
  db: Db,
  partId: string,
  branchId: string | null,
  oldBin: string | null | undefined,
  newBin: string | null | undefined,
  changedById?: string | null,
) {
  if (bin(oldBin) === bin(newBin)) return;
  await db.partBinHistory.create({ data: { partId, branchId, oldBin: bin(oldBin), newBin: bin(newBin), changedById: changedById ?? null } });
}
