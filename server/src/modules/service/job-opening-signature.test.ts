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
  openingCheckInScope,
  openingJobScope,
  printSignedJobOpening,
  signJobOpening,
} from "./job-opening-signature.service";
import {
  openingHash,
  openingEvidenceHash,
  validOpeningEvidence,
  signedOpeningDocumentSchema,
  signedOpeningDocumentV2,
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
  stage: "ESTIMATE",
  serviceTypeId: "service-type",
  billedAt: null,
  openingSignatureRequired: true,
  checkIn: null,
  damageMarks: [],
  photos: [],
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
  scope: openingJobScope(job as unknown as Parameters<typeof openingJobScope>[0]),
});
/** What new signatures sign from phase 2: the job details plus the walk-around. */
const documentV2 = signedOpeningDocumentSchema.parse({
  ...document,
  version: 2,
  scope: openingCheckInScope(job as unknown as Parameters<typeof openingCheckInScope>[0]),
});
const body = {
  accepted: true,
  expectedHash: openingHash(documentV2),
  idempotencyKey: id,
  signerName: "Test Customer",
  signatureImage: image,
};
/** A stored signature. The default is an old version 1 signature, taken before check-in existed. */
function signature(doc: typeof document = document, signerPhone: string | null = null) {
  const evidence = {
    documentHash: openingHash(doc),
    signerName: body.signerName,
    relationship: null,
    capturedById: "actor",
    signedAt: new Date("2026-11-17T09:30:00Z"),
    signatureImage: image,
    signerPhone,
  };
  return {
    id: "signature",
    jobCardId: id,
    revision: 1,
    idempotencyKey: id,
    scopeHash: openingHash(doc.scope),
    snapshot: doc,
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
  ).toBe(openingHash(document));
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
      snapshot: documentV2,
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
  expect(prisma.jobOpeningSignature.findFirst).toHaveBeenCalledWith({
    where: { jobCardId: id },
    orderBy: { revision: "desc" },
    select: { revision: true },
  });
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 10000 });
});

it("returns original metadata on an identical retry and rejects reuse with changed details", async () => {
  (prisma.jobOpeningSignature.findUnique as jest.Mock).mockResolvedValue(
    signature(documentV2),
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
      { ...body, signerName: "Representative", relationship: "Fleet manager", signerPhone: "0803 555 0199" },
      "actor",
    ),
  ).resolves.toMatchObject({ signerName: "Representative", signerPhone: "0803 555 0199" });
});

it("creates a new signed revision after material changes without overwriting earlier evidence", async () => {
  (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(
    signature(),
  );
  const updated = { ...job, description: "Inspect brakes and steering" };
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(updated);
  const nextDocument = {
    ...documentV2,
    scope: openingCheckInScope(updated as unknown as Parameters<typeof openingCheckInScope>[0]),
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

describe("version 2 documents with the check-in snapshot (phase 2)", () => {
  const walkedJob = {
    ...job,
    stage: "CHECK_IN",
    checkIn: {
      fuelLevel: "HALF",
      checklist: { HUB_CAPS: "MISSING" },
      checklistNote: null,
      serviceBookSeen: true,
      serviceBookStamps: 3,
      noValuables: true,
      belongingsNote: "Umbrella in boot",
    },
    damageMarks: [{ id: "mark", type: "SCRATCH", x: 50, y: 96, note: null, photoId: null, createdAt: new Date("2026-11-17T09:10:00Z") }],
    photos: [{ id: "photo", category: "CHECK_IN", slot: "FRONT", sha256: "a".repeat(64) }],
  };
  const v2 = signedOpeningDocumentV2.parse({
    ...document,
    version: 2,
    scope: openingCheckInScope(walkedJob as unknown as Parameters<typeof openingCheckInScope>[0]),
  });

  it("verifies old version 1 signatures and new version 2 signatures", () => {
    expect(validOpeningEvidence(signature())).toBe(true);
    expect(validOpeningEvidence(signature(v2))).toBe(true);
    expect(validOpeningEvidence(signature(v2, "0803 555 0199"))).toBe(true);
  });

  it("keeps the evidence hash of signatures taken before the phone was recorded", () => {
    const old = signature();
    const { signerPhone: _phone, ...withoutPhone } = old;
    expect(openingEvidenceHash(withoutPhone)).toBe(old.evidenceHash);
    expect(validOpeningEvidence({ ...signature(v2, "0803 555 0199"), signerPhone: "0803 555 0100" })).toBe(false);
  });

  it("covers the walk-around: changing fuel, checklist, marks or photos breaks the hash", () => {
    const scope = v2.scope;
    for (const checkIn of [
      { ...scope.checkIn, fuelLevel: "FULL" as const },
      { ...scope.checkIn, belongingsNote: "Laptop in boot" },
      { ...scope.checkIn, damageMarks: [] },
      { ...scope.checkIn, photos: [{ ...scope.checkIn.photos[0], sha256: "b".repeat(64) }] },
    ])
      expect(validOpeningEvidence({ ...signature(v2), snapshot: { ...v2, scope: { ...scope, checkIn } } })).toBe(false);
  });

  it("keeps a version 1 signature current on an unchanged job, and a version 2 signature goes stale when the walk-around changes", async () => {
    (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(signature());
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue(walkedJob);
    await expect(assertSignedJobOpening(prisma, id)).resolves.toBeUndefined();

    (prisma.jobOpeningSignature.findFirst as jest.Mock).mockResolvedValue(signature(v2));
    await expect(assertSignedJobOpening(prisma, id)).resolves.toBeUndefined();
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...walkedJob, checkIn: { ...walkedJob.checkIn, fuelLevel: "FULL" } });
    expect((await getSignedOpeningConsent(id)).state).toBe("stale");
  });

  it("refuses a signature at check-in until Details and Walk-around are complete", async () => {
    (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({ ...walkedJob, checkIn: null });
    await expect(signJobOpening(id, body, "actor")).rejects.toMatchObject({
      code: "CHECK_IN_INCOMPLETE",
      message: "Finish Details and Walk-around before the customer signs.",
    });
    expect(prisma.jobOpeningSignature.create).not.toHaveBeenCalled();
  });

  it("needs a phone number from a representative", () => {
    const result = openingSignatureBody.safeParse({ ...body, signerName: "Rep", relationship: "Driver" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["signerPhone"], message: "Enter the phone number of the person signing for the customer" });
  });
});
