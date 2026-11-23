import { ChargeType } from "@prisma/client";
import { BadRequestError } from "../../shared/errors/appError";
import { money } from "../finance/money";

type LinkedPart = {
  id: string;
  mainPartId: string | null;
  sourceOfPartId: string | null;
};
export function partFamilyId(part: LinkedPart): string {
  return part.sourceOfPartId ?? part.mainPartId ?? part.id;
}

/** Linked alternates and one-level source records share an existing catalogue family. */
export function assertPartSubstitution(
  actual: LinkedPart,
  requested: LinkedPart | undefined,
  reason?: string,
) {
  if (!requested || actual.id === requested.id) return;
  if (partFamilyId(actual) !== partFamilyId(requested))
    throw new BadRequestError(
      "Choose a registered alternate or source of the requested part",
    );
  if (!reason?.trim())
    throw new BadRequestError(
      "Enter a reason for substituting the requested part",
    );
}

/** Shared with issuance so the chooser never quotes a different fallback rate. */
export function requisitionPartRate(
  part: {
    retailRate: number | null;
    warrantyRate: number | null;
    unitPrice: number;
  },
  chargeType: ChargeType,
): number {
  return money(
    chargeType === ChargeType.WARRANTY
      ? (part.warrantyRate ?? part.retailRate ?? part.unitPrice)
      : (part.retailRate ?? part.unitPrice),
  );
}
