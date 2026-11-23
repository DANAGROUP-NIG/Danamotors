import { createHash } from "crypto";

/** Binds collection identity, original issued scope and the signature image together. */
export function collectionContentHash(
  issue: {
    id: string;
    jobCardId: string;
    sparePartId: string;
    quantity: number;
    partSource: string | null;
  },
  signerId: string,
  signedAt: Date,
  signatureImage: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        issuanceId: issue.id,
        jobCardId: issue.jobCardId,
        sparePartId: issue.sparePartId,
        quantity: issue.quantity,
        partSource: issue.partSource,
        signerId,
        signedAt: signedAt.toISOString(),
        signatureHash: createHash("sha256")
          .update(signatureImage)
          .digest("hex"),
      }),
    )
    .digest("hex");
}
