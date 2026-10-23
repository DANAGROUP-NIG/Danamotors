import { ConflictError } from '../../shared/errors/appError';
type RevisionSource = { id: string; version: number; description: string; amount: number; lines: unknown[] };
export function planEstimateRevision(previous: RevisionSource | undefined, sourceId: string | undefined, next: { description: string; amount: number; lines: unknown[] }) {
 if (sourceId && previous?.id !== sourceId) throw new ConflictError('Only the latest estimate can be revised');
 if (!sourceId && previous) throw new ConflictError('Use revise estimate to change existing scope');
 return { version: previous ? previous.version + 1 : 1, supersedesId: previous?.id ?? null,
  diff: { before: previous ? { description: previous.description, amount: previous.amount, lines: previous.lines } : null, after: next } };
}
