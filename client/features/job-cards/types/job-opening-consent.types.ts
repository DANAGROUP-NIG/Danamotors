import type { SignedCheckIn } from "./job-check-in.types";

type OpeningDocumentBase = {
  termsVersion: string;
  statement: string;
  terms: string[];
  footer: string | null;
  scope: {
    jobCardId: string;
    jobNumber: string;
    branchId: string;
    branchName: string;
    customerId: string | null;
    customerName: string;
    vehicleId: string | null;
    registration: string | null;
    vin: string | null;
    mileage: number | null;
    openedAt: string;
    promisedAt: string | null;
    service: string;
    description: string | null;
    requests: {
      id: string;
      complaintCodeId: string | null;
      defectCode: string | null;
      description: string;
    }[];
  };
};
/**
 * Version 1 was signed before check-in existed. Version 2 (phase 2) also holds the walk-around
 * the customer confirmed: fuel, checklist, damage marks, belongings and photos.
 */
export type SignedOpeningDocument =
  | (OpeningDocumentBase & { version: 1 })
  | (Omit<OpeningDocumentBase, "scope"> & { version: 2; scope: OpeningDocumentBase["scope"] & { checkIn: SignedCheckIn } });
export type OpeningSignature = {
  id: string;
  revision: number;
  signerName: string;
  relationship: string | null;
  /** A representative's phone. Null for the owner and for older signatures. */
  signerPhone?: string | null;
  signedAt: string;
};
export type JobOpeningConsent = {
  document: SignedOpeningDocument;
  expectedHash: string;
  state: "legacy" | "required" | "signed" | "stale" | "invalid";
  signature: OpeningSignature | null;
};
export type OpeningSignatureInput = {
  accepted: true;
  expectedHash: string;
  idempotencyKey: string;
  signerName: string;
  relationship?: string;
  signerPhone?: string;
  signatureImage: string;
};
export type JobOpeningPrint = {
  document: SignedOpeningDocument;
  current: boolean;
  signature: OpeningSignature & { signatureImage: string };
};
