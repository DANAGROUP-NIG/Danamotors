jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    jobCard: { findUnique: jest.fn(), update: jest.fn() },
    jobOpeningSignature: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerApproval: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));
import prisma from "../../prisma/client";
import { DocumentTermsService } from "../document-terms/document-terms.service";
import {
  assertSignedJobOpening,
  getSignedOpeningConsent,
  openingJobScope,
  printSignedJobOpening,
  signJobOpening,
} from "./job-opening-signature.service";
import {
  openingHash,
  openingEvidenceHash,
  validOpeningEvidence,
  signedOpeningDocumentSchema,
  SIGNED_OPENING_STATEMENT,
  openingSignatureBody,
} from "./job-opening-signature.logic";

const id = "11111111-1111-4111-8111-111111111111";
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const job = {
  id,
  jobNumber: "J1",
  branchId: "branch",
  customerId: "customer",
  vehicleId: "vehicle",
  branch: { name: "Test branch" },
  customer: { firstName: "Test", lastName: "Customer", companyName: null },
  vehicle: { registrationNumber: "SYNTHETIC", vin: "SYNTHETIC-VIN" },
  serviceType: { description: "Inspection" },
  service: null,
  description: "Inspect brakes",
  mileage: 100,
  promisedAt: new Date("2026-11-20T14:00:00Z"),
  createdAt: new Date("2026-11-17T09:00:00Z"),
  complaints: [
    {
      id: "request",
      complaintCodeId: null,
      defectCode: null,
      description: "Brake noise",
    },
  ],
  status: "OPEN",
  billedAt: null,
  openingSignatureRequired: true,
};
const terms = {
  terms: ["Job opening only, repair approval is separate."],
  footer: "Test footer",
};
const document = signedOpeningDocumentSchema.parse({
  version: 1,
  termsVersion: openingHash({ statement: SIGNED_OPENING_STATEMENT, ...terms }),
  statement: SIGNED_OPENING_STATEMENT,
  ...terms,
  scope: openingJobScope(job as Parameters<typeof openingJobScope>[0]),
});
const body = {
  accepted: true,
  expectedHash: openingHash(document),
  idempotencyKey: id,
  signerName: "Test Customer",
  signatureImage: image,
};
function signature() {
  const evidence = {
    documentHash: body.expectedHash,
    signerName: body.signerName,
    relationship: null,
    capturedById: "actor",
    signedAt: new Date("2026-11-17T09:30:00Z"),
    signatureImage: image,
  };
  return {
    id: "signature",
    jobCardId: id,
    revision: 1,
    idempotencyKey: id,
    scopeHash: openingHash(document.scope),
    snapshot: document,
    ...evidence,
    evidenceHash: openingEvidenceHash(evidence),
  };
}
beforeEach(() => {
  jest.resetAllMocks();
  jest
    .spyOn(DocumentTermsService.prototype, "effective")
    .mockResolvedValue(terms);
  (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
    callback(prisma),
  );
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(job);
  (prisma.jobOpeningSignature.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.jobOpeningSignature.create as jest.Mock).mockImplementation(
    ({ data }) => ({ id: "signature", ...data }),
  );
});
afterEach(() => jest.restoreAllMocks());

it("hashes JSONB objects consistently and detects changes to scope, terms, image and signer evidence", () => {
  expect(
    openingHash(Object.fromEntries(Object.entries(document).reverse())),
  ).toBe(body.expectedHash);
  expect(validOpeningEvidence(signature())).toBe(true);
  for (const change of [
    { snapshot: { ...document, terms: ["Changed terms"] } },
    {
      snapshot: {
        ...document,
        scope: { ...document.scope, promisedAt: "2026-11-21T14:00:00Z" },
      },
    },
    { signerName: "Another signer" },
    { capturedById: "other" },
    { signedAt: new Date("2026-11-17T09:31:00Z") },
    { signatureImage: "data:image/png;base64,AAAA" },
  ])
    expect(validOpeningEvidence({ ...signature(), ...change })).toBe(false);
});

it("requires explicit acceptance and bounded signature input without accepting caller snapshots or timestamps", () => {
  expect(openingSignatureBody.safeParse(body).success).toBe(true);
  for (const patch of [
    { accepted: false },
    { signerName: " " },
    { signatureImage: "x".repeat(88001) },
    { snapshot: document },
    { signedAt: "2020-01-01" },
  ]) {
    expect(openingSignatureBody.safeParse({ ...body, ...patch }).success).toBe(
      false,
    );
  }
});

it("stores an independent immutable opening approval and image-free audit without approving an estimate", async () => {
  await expect(signJobOpening(id, body, "actor")).resolves.toMatchObject({
    revision: 1,
    signerName: "Test Customer",
  });
  expect(prisma.jobOpeningSignature.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      snapshot: document,
      signatureImage: image,
      capturedById: "actor",
      signedAt: expect.any(Date),
      evidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  });
  const audit = (prisma.auditLog.create as jest.Mock).mock.calls[0][0].data;
  expect(audit.action).toBe("JOB_OPENING_SIGNED");
  expect(audit.details).not.toContain(image);
  expect(audit.details).not.toContain("Test Customer");
  expect(prisma.customerApproval.create).not.toHaveBeenCalled();
});

it("returns original metadata on an identical retry and rejects reuse with changed details", async () => {
  (prisma.jobOpeningSignature.findUnique as jest.Mock).mockResolvedValue(
    signature(),
  );
  await expect(signJobOpening(id, body, "actor")).resolves.toMatchObject({
    id: "signature",
  });
  expect(prisma.jobOpeningSignature.create).not.toHaveBeenCalled();
  await expect(
    signJobOpening(id, { ...body, signerName: "Other" }, "actor"),
  ).rejects.toThrow("retry key");
});

it("refuses stale scope or terms and requires representative authority", async () => {
  await expect(
    signJobOpening(id, { ...body, expectedHash: "0".repeat(64) }, "actor"),
  ).rejects.toThrow("changed");
  await expect(
    signJobOpening(id, { ...body, signerName: "Representative" }, "actor"),
  ).rejects.toThrow("relationship");
  await expect(
    signJobOpening(
      id,
      { ...body, signerName: "Representative", relationship: "Fleet manager" },
      "actor",
    ),
  ).resolves.toMatchObject({ signerName: "Representative" });
});

it("creates a new signed revision after material changes without overwriting earlier evidence", async () => {
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(
    signature(),
  );
  const updated = { ...job, description: "Inspect brakes and steering" };
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(updated);
  const nextDocument = {
    ...document,
    scope: openingJobScope(updated as Parameters<typeof openingJobScope>[0]),
  };
  await expect(
    signJobOpening(
      id,
      { ...body, expectedHash: openingHash(nextDocument) },
      "actor",
    ),
  ).resolves.toMatchObject({ revision: 2 });
  expect(prisma.jobOpeningSignature.update).not.toHaveBeenCalled();
});

it("blocks unsigned or materially changed new jobs while preserving legacy workflows", async () => {
  await expect(assertSignedJobOpening(prisma, id)).rejects.toMatchObject({
    code: "JOB_OPENING_SIGNATURE_REQUIRED",
  });
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(
    signature(),
  );
  await expect(assertSignedJobOpening(prisma, id)).resolves.toBeUndefined();
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    ...job,
    description: "Changed opening scope",
  });
  await expect(assertSignedJobOpening(prisma, id)).rejects.toThrow(
    "current signed",
  );
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    ...job,
    openingSignatureRequired: false,
  });
  await expect(assertSignedJobOpening(prisma, id)).resolves.toBeUndefined();
});

it("keeps signed terms valid after company terms change, and returns no image in ordinary metadata", async () => {
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(
    signature(),
  );
  jest
    .spyOn(DocumentTermsService.prototype, "effective")
    .mockResolvedValue({
      terms: ["New terms for future signatures"],
      footer: null,
    });
  const result = await getSignedOpeningConsent(id);
  expect(result.state).toBe("signed");
  expect(JSON.stringify(result)).not.toContain(image);
  expect(result.signature).not.toHaveProperty("signatureImage");
});

it("prints the requested saved revision, rejects foreign IDs and refuses corrupted evidence", async () => {
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(
    signature(),
  );
  const result = await printSignedJobOpening(id, "signature");
  expect(prisma.jobOpeningSignature.findFirst).toHaveBeenCalledWith({
    where: { id: "signature", jobCardId: id },
  });
  expect(result.document).toEqual(document);
  expect(result.signature.signatureImage).toBe(image);
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(null);
  await expect(printSignedJobOpening(id, "foreign")).rejects.toThrow(
    "not found",
  );
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue({
    ...signature(),
    signerName: "Tampered",
  });
  await expect(printSignedJobOpening(id, "signature")).rejects.toThrow(
    "verified",
  );
});

it("rejects signing after billing and propagates audit failure from the transaction", async () => {
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    ...job,
    billedAt: new Date(),
  });
  await expect(signJobOpening(id, body, "actor")).rejects.toThrow("billed");
  expect(prisma.jobOpeningSignature.create).not.toHaveBeenCalled();
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(job);
  (prisma.auditLog.create as jest.Mock).mockRejectedValueOnce(
    new Error("audit unavailable"),
  );
  await expect(signJobOpening(id, body, "actor")).rejects.toThrow(
    "audit unavailable",
  );
});
