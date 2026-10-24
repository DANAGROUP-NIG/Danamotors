import { Prisma } from '@prisma/client';
import { ForbiddenError } from '../../shared/errors/appError';
import { sumMoney } from '../finance/money';

export type ServiceDocumentActor = { userId: string; branchId?: string | null; allBranches: boolean };
export function assertDocumentBranch(actor: ServiceDocumentActor, branchId: string | null) {
  // Unassigned legacy estimates need a branch before document actions can be performed.
  if (!branchId || (!actor.allBranches && (!actor.branchId || actor.branchId !== branchId))) throw new ForbiddenError('You can only access service documents in your branch');
}
export function remarksChange(oldValue: string | null, newValue: string | null) {
  const remarks = newValue?.trim() || null;
  return { oldValue, newValue: remarks, changed: oldValue !== remarks };
}
export type PickingLine = { id: string; type: string; referenceId: string | null; partSource: string | null; description: string; quantity: number; rate: number; amount: number };
export type PickingPart = { id: string; partNumber: string; uom: string };
/** Internal projection, deliberately excluding costs, suppliers and customer contact data. */
export function projectPickingLines(lines: PickingLine[], parts: PickingPart[]) {
  const catalogue = new Map(parts.map(part => [part.id, part]));
  const rows = lines.filter(line => ['PART', 'INCLUDED_PART'].includes(line.type) && line.quantity > 0).map(line => {
    const part = catalogue.get(line.referenceId ?? '');
    return { lineId: line.id, partId: line.referenceId, partNumber: part?.partNumber ?? null, flag: line.partSource, description: line.description, uom: part?.uom ?? null, quantityRequired: line.quantity, rate: line.rate, amount: line.amount };
  });
  return { lines: rows, totals: { numberOfItems: rows.length, quantityRequired: rows.reduce((sum, row) => sum.plus(row.quantityRequired), new Prisma.Decimal(0)).toNumber(), totalAmount: sumMoney(rows.map(row => row.amount)) } };
}
