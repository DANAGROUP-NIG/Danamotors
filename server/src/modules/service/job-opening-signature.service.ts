import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { DocumentTermsService } from "../document-terms/document-terms.service";
import { assertSignaturePng } from "./estimate-signature";
import { checkInGates, checkInSnapshot, readChecklist } from "./job-check-in.logic";
import {
  openingSignatureBody,
  openingHash,
  openingEvidenceHash,
  validOpeningEvidence,
  sameSigner,
  signedOpeningDocumentSchema,
  SIGNED_OPENING_STATEMENT,
} from "./job-opening-signature.logic";

const include = {
  customer: { select: { firstName: true, lastName: true, companyName: true } },
  vehicle: { select: { registrationNumber: true, vin: true } },
  branch: { select: { name: true } },
  serviceType: { select: { description: true } },
  service: { select: { name: true } },
  complaints: { orderBy: { id: "asc" as const } },
  checkIn: true,
  damageMarks: true,
  // Never the photo bytes: the hash covers each photo's SHA-256.
  photos: { select: { id: true, category: true, slot: true, sha256: true } },
} satisfies Prisma.JobCardInclude;
type Job = Prisma.JobCardGetPayload<{ include: typeof include }>;
type Signature = Prisma.JobOpeningSignatureGetPayload<Record<string, never>>;
type Database = Prisma.TransactionClient | typeof prisma;

/** Version 1 scope: the job details only. Used for signatures taken before check-in existed. */
export function openingJobScope(job: Omit<Job, "checkIn" | "damageMarks" | "photos">) {
  return {
    jobCardId: job.id,
    jobNumber: job.jobNumber,
    branchId: job.branchId,
    branchName: job.branch.name,
    customerId: job.customerId,
    customerName:
      job.customer?.companyName ||
      [job.customer?.firstName, job.customer?.lastName]
        .filter(Boolean)
        .join(" ") ||
      "Not provided",
    vehicleId: job.vehicleId,
    registration: job.vehicle?.registrationNumber ?? null,
    vin: job.vehicle?.vin ?? null,
    mileage: job.mileage,
    openedAt: job.createdAt.toISOString(),
    promisedAt: job.promisedAt?.toISOString() ?? null,
    service:
      job.serviceType?.description ?? job.service?.name ?? "Not provided",
    description: job.description,
    requests: [...job.complaints]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .map((row) => ({
        id: row.id,
        complaintCodeId: row.complaintCodeId,
        defectCode: row.defectCode,
        description: row.description,
      })),
  };
}

/** Version 2 scope: the job details plus the walk-around the customer confirmed. */
export function openingCheckInScope(job: Job) {
  return { ...openingJobScope(job), checkIn: checkInSnapshot(job.checkIn, job.damageMarks, job.photos) };
}

/** The job's current scope in the same version as a signed document, so older signatures stay current. */
function currentScopeHash(job: Job, version: number) {
  return openingHash(version === 1 ? openingJobScope(job) : openingCheckInScope(job));
}

function signatureVersion(snapshot: unknown): number {
  const parsed = signedOpeningDocumentSchema.safeParse(snapshot);
  return parsed.success ? parsed.data.version : 2;
}

export type OpeningConsentState = "legacy" | "required" | "signed" | "stale" | "invalid";

/** The state of the latest signature against the job as it is now. */
export function consentStateOf(job: Job, signature: Signature | null): OpeningConsentState {
  if (!signature) return job.openingSignatureRequired ? "required" : "legacy";
  if (!validOpeningEvidence(signature)) return "invalid";
  return signature.scopeHash === currentScopeHash(job, signatureVersion(signature.snapshot)) ? "signed" : "stale";
}

async function latestSignature(db: Database, jobCardId: string) {
  return db.jobOpeningSignature.findFirst({ where: { jobCardId }, orderBy: { revision: "desc" } });
}

/** Loads the job and returns its consent state. Used by the check-in gates. */
export async function openingConsentState(db: Database, id: string): Promise<OpeningConsentState> {
  const job = await loadJob(db, id);
  return consentStateOf(job, await latestSignature(db, id));
}

async function loadJob(db: Database, id: string) {
  const job = await db.jobCard.findUnique({ where: { id }, include });
  if (!job) throw new NotFoundError("Job card not found");
  return job;
}
async function documentFor(db: Database, job: Job) {
  const terms = await new DocumentTermsService().effective(
    "JOB_CARD",
    job.branchId,
    db,
  );
  const content = {
    statement: SIGNED_OPENING_STATEMENT,
    terms: terms.terms,
    footer: terms.footer,
  };
  return signedOpeningDocumentSchema.parse({
    version: 2,
    termsVersion: openingHash(content),
    ...content,
    scope: openingCheckInScope(job),
  });
}
function metadata(signature: Signature) {
  return {
    id: signature.id,
    revision: signature.revision,
    signerName: signature.signerName,
    relationship: signature.relationship,
    signerPhone: signature.signerPhone,
    signedAt: signature.signedAt.toISOString(),
  };
}

/** Returns current opening scope and metadata only; signature images stay in the print endpoint. */
export async function getSignedOpeningConsent(
  id: string,
  db: Database = prisma,
) {
  const job = await loadJob(db, id);
  const document = await documentFor(db, job);
  const signature = await latestSignature(db, id);
  const state = consentStateOf(job, signature);
  return {
    document,
    expectedHash: openingHash(document),
    state,
    signature: signature ? metadata(signature) : null,
  };
}

/** Captures a customer signature atomically with immutable scope/terms and an image-free audit. */
export async function signJobOpening(
  id: string,
  input: unknown,
  actorId: string,
) {
  const body = openingSignatureBody.parse(input);
  assertSignaturePng(body.signatureImage);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`;
    const job = await loadJob(tx, id);
    const existing = await tx.jobOpeningSignature.findUnique({
      where: { idempotencyKey: body.idempotencyKey },
    });
    if (existing) {
      if (!validOpeningEvidence(existing))
        throw new ConflictError(
          "Stored signature evidence could not be verified. Obtain a new signature",
        );
      if (
        existing.jobCardId !== id ||
        existing.documentHash !== body.expectedHash ||
        existing.capturedById !== actorId ||
        existing.signerName !== body.signerName ||
        existing.relationship !== (body.relationship || null) ||
        existing.signerPhone !== (body.signerPhone || null) ||
        existing.signatureImage !== body.signatureImage
      )
        throw new ConflictError(
          "This signature retry key was already used for different details",
        );
      return metadata(existing);
    }
    if (!job.customerId)
      throw new BadRequestError(
        "A customer is required before signing job opening consent",
      );
    if (
      job.billedAt ||
      ["BILLED", "DELIVERED", "CANCELLED", "CANCELED", "CLOSED"].includes(
        job.status.trim().toUpperCase(),
      )
    )
      throw new BadRequestError(
        "Closed or billed job cards cannot receive a new opening signature",
      );
    // At check-in the customer confirms the finished details and walk-around, so both must be complete.
    if (job.stage === "CHECK_IN") {
      const gates = checkInGates(
        {
          mileage: job.mileage,
          serviceTypeId: job.serviceTypeId,
          promisedAt: job.promisedAt,
          complaintCount: job.complaints.length,
          fuelLevel: job.checkIn?.fuelLevel ?? null,
          checklist: readChecklist(job.checkIn?.checklist),
          consentState: "signed",
        },
        new Date(),
      );
      const missing = [...gates.details, ...gates.walkAround];
      if (missing.length)
        throw new ConflictError(
          "Finish Details and Walk-around before the customer signs.",
        ).withCode("CHECK_IN_INCOMPLETE", { reasons: missing });
    }
    const document = await documentFor(tx, job);
    if (openingHash(document) !== body.expectedHash)
      throw new ConflictError(
        "Job details or terms changed. Reload the consent and obtain a new signature",
      );
    if (
      !sameSigner(body.signerName, document.scope.customerName) &&
      !body.relationship
    )
      throw new BadRequestError(
        "Enter the relationship or authority of the person signing for the customer",
      );
    const previous = await tx.jobOpeningSignature.findFirst({
      where: { jobCardId: id },
      orderBy: { revision: "desc" },
      select: { revision: true },
    });
    const evidence = {
      documentHash: body.expectedHash,
      signerName: body.signerName,
      relationship: body.relationship || null,
      signerPhone: body.signerPhone || null,
      capturedById: actorId,
      signedAt: new Date(),
      signatureImage: body.signatureImage,
    };
    const signature = await tx.jobOpeningSignature.create({
      data: {
        jobCardId: id,
        revision: (previous?.revision ?? 0) + 1,
        idempotencyKey: body.idempotencyKey,
        snapshot: document,
        scopeHash: openingHash(document.scope),
        ...evidence,
        evidenceHash: openingEvidenceHash(evidence),
      },
    });
    await tx.jobCard.update({
      where: { id },
      data: { openingSignatureRequired: true },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "JOB_OPENING_SIGNED",
        details: JSON.stringify({
          jobCardId: id,
          signatureId: signature.id,
          revision: signature.revision,
          documentHash: signature.documentHash,
        }),
      },
    });
    return metadata(signature);
  }, { timeout: 10000 });
}

/** New jobs require a valid signature for their current opening scope; historical jobs retain compatibility. */
export async function assertSignedJobOpening(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const job = await loadJob(tx, id);
  if (!job.openingSignatureRequired) return;
  if (consentStateOf(job, await latestSignature(tx, id)) !== "signed")
    throw new BadRequestError(
      "Obtain a current signed job-opening consent before starting or completing work",
    ).withCode("JOB_OPENING_SIGNATURE_REQUIRED", { field: "openingSignature" });
}

export async function hasCurrentOpeningSignature(
  db: Database,
  job: { id: string; openingSignatureRequired: boolean },
): Promise<boolean> {
  if (!job.openingSignatureRequired) return true;
  const state = await openingConsentState(db, job.id);
  return state === "signed";
}

/** Prints a specific immutable revision, never a live mutable job card or unrelated estimate. */
export async function printSignedJobOpening(
  id: string,
  signatureId: string,
  db: Database = prisma,
) {
  const signature = await db.jobOpeningSignature.findFirst({
    where: { id: signatureId, jobCardId: id },
  });
  if (!signature)
    throw new NotFoundError("Signed job opening consent not found");
  if (!validOpeningEvidence(signature))
    throw new ConflictError(
      "Signature evidence could not be verified. Obtain a new signature",
    );
  const job = await loadJob(db, id);
  const document = signedOpeningDocumentSchema.parse(signature.snapshot);
  return {
    document,
    signature: {
      ...metadata(signature),
      signatureImage: signature.signatureImage,
    },
    current: signature.scopeHash === currentScopeHash(job, document.version),
  };
}
