import type { CsiApplicability } from "@prisma/client";
import { lagosDay } from "../finance/credit-terms";
import { defaultServiceCategory } from "../workshop/service-type.defaults";
import { ConflictError } from "../../shared/errors/appError";

export type EligibleRevision = {
  id: string;
  cardId: string;
  effectiveDate: Date;
  appliesTo: CsiApplicability;
  version: number;
};

export function csiJobApplicability(
  serviceType: { category?: string | null; code: string } | null,
): Exclude<CsiApplicability, "BOTH"> | null {
  if (!serviceType) return null;
  return (serviceType.category?.trim().toUpperCase() ||
    defaultServiceCategory(serviceType.code)) === "ACCIDENTAL"
    ? "ACCIDENTAL"
    : "NON_ACCIDENTAL";
}

export function selectCsiRevision<T extends EligibleRevision>(
  revisions: T[],
  jobDate: Date,
  appliesTo: ReturnType<typeof csiJobApplicability>,
): T | null {
  const day = lagosDay(jobDate);
  const eligible = revisions.filter(
    (row) =>
      row.effectiveDate.toISOString().slice(0, 10) <= day &&
      (row.appliesTo === "BOTH" || row.appliesTo === appliesTo),
  );
  eligible.sort(
    (a, b) =>
      b.effectiveDate.getTime() - a.effectiveDate.getTime() ||
      Number(b.appliesTo === appliesTo) - Number(a.appliesTo === appliesTo) ||
      b.version - a.version ||
      a.id.localeCompare(b.id),
  );
  const first = eligible[0];
  if (!first) return null;
  // TODO(confirm): equally applicable cards require explicit master correction.
  if (
    eligible.some(
      (row) =>
        row.cardId !== first.cardId &&
        row.effectiveDate.getTime() === first.effectiveDate.getTime() &&
        row.appliesTo === first.appliesTo,
    )
  ) {
    throw new ConflictError(
      "Several CSI cards match this job on the same effective date. Deactivate or re-date the duplicate card before generating.",
    );
  }
  return first;
}
