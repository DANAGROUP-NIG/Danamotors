export type SignedOpeningDocument = {
  version: 1;
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
export type OpeningSignature = {
  id: string;
  revision: number;
  signerName: string;
  relationship: string | null;
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
  signatureImage: string;
};
export type JobOpeningPrint = {
  document: SignedOpeningDocument;
  current: boolean;
  signature: OpeningSignature & { signatureImage: string };
};
