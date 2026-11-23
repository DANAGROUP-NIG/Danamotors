import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors/appError";
import { DocumentTermsService } from "../document-terms/document-terms.service";
import { assertSignaturePng } from "./estimate-signature";
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
} satisfies Prisma.JobCardInclude;
type Job = Prisma.JobCardGetPayload<{ include: typeof include }>;
type Signature = Prisma.JobOpeningSignatureGetPayload<Record<string, never>>;
type Database = Prisma.TransactionClient | typeof prisma;

export function openingJobScope(job: Job) {
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
    version: 1,
    termsVersion: openingHash(content),
    ...content,
    scope: openingJobScope(job),
  });
}
function metadata(signature: Signature) {
  return {
    id: signature.id,
    revision: signature.revision,
    signerName: signature.signerName,
    relationship: signature.relationship,
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
  const signature = await db.jobOpeningSignature.findFirst({
    where: { jobCardId: id },
    orderBy: { revision: "desc" },
  });
  const state = !signature
    ? job.openingSignatureRequired
      ? "required"
      : "legacy"
    : !validOpeningEvidence(signature)
      ? "invalid"
      : signature.scopeHash !== openingHash(document.scope)
        ? "stale"
        : "signed";
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
  const signature = await tx.jobOpeningSignature.findFirst({
    where: { jobCardId: id },
    orderBy: { revision: "desc" },
  });
  if (
    !signature ||
    !validOpeningEvidence(signature) ||
    signature.scopeHash !== openingHash(openingJobScope(job))
  )
    throw new BadRequestError(
      "Obtain a current signed job-opening consent before starting or completing work",
    ).withCode("JOB_OPENING_SIGNATURE_REQUIRED", { field: "openingSignature" });
}

export async function hasCurrentOpeningSignature(
  db: Database,
  job: Job,
): Promise<boolean> {
  if (!job.openingSignatureRequired) return true;
  const signature = await db.jobOpeningSignature.findFirst({
    where: { jobCardId: job.id },
    orderBy: { revision: "desc" },
  });
  return (
    !!signature &&
    validOpeningEvidence(signature) &&
    signature.scopeHash === openingHash(openingJobScope(job))
  );
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
    current: signature.scopeHash === openingHash(openingJobScope(job)),
  };
}
