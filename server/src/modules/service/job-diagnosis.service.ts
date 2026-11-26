import { JobCardType, Prisma, WarrantyCoverageStatus } from "@prisma/client";
import prisma from "../../prisma/client";
import { ROLES } from "../../shared/constants/roles";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { categoryOf } from "../reports/report.logic";
import { decodePhoto, PhotoProblem } from "./job-check-in.logic";
import {
  bayStates,
  canAllocate,
  canWorkDiagnosis,
  diagnosisRoute,
  diagnosisSubStep,
  findingBody,
  findingPhotoBody,
  findingProblems,
  IN_WORKSHOP_STAGES,
  isReturned,
  itemQuantity,
  MAX_EXTRA_FINDINGS,
  MAX_PHOTOS_PER_FINDING,
  WARRANTY_SKIPPED_REASON,
  type DiagnosisSubStep,
} from "./job-diagnosis.logic";
import { STAGE_LABELS, type StageAction, type StageActor } from "./job-stage.logic";

type Tx = Prisma.TransactionClient;
type Database = Tx | typeof prisma;

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const fullName = (user: { firstName: string; lastName: string } | null | undefined) =>
  user ? `${user.firstName} ${user.lastName}`.trim() : null;
const audit = (tx: Tx, userId: string, action: string, details: Record<string, unknown>) =>
  tx.auditLog.create({ data: { userId, action, details: JSON.stringify(details) } });
const lockJob = (tx: Tx, id: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);

const findingSelect = {
  id: true,
  complaintId: true,
  causeAndDefect: true,
  possibleWarranty: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  createdBy: person,
  items: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, referenceId: true, description: true, quantity: true } },
  photos: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, createdAt: true } },
} satisfies Prisma.JobFindingSelect;
type FindingRow = Prisma.JobFindingGetPayload<{ select: typeof findingSelect }>;

function findingView(row: FindingRow) {
  return {
    id: row.id,
    complaintId: row.complaintId,
    causeAndDefect: row.causeAndDefect,
    possibleWarranty: row.possibleWarranty,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: fullName(row.createdBy),
    // Quantities are decimals; sent as numbers with at most 2 places (never money).
    items: row.items.map((item) => ({ ...item, quantity: item.quantity.toNumber() })),
    photos: row.photos,
  };
}

/** The facts the stage rules need while a job is at Diagnosis: who holds it, the gates and the routing. */
export async function loadDiagnosisFacts(db: Database, id: string) {
  const job = await db.jobCard.findUniqueOrThrow({
    where: { id },
    select: {
      complaints: { select: { id: true } },
      findings: { select: { complaintId: true, causeAndDefect: true, possibleWarranty: true } },
      diagnosis: { select: { submittedAt: true, returnedAt: true } },
    },
  });
  return {
    submitted: !!job.diagnosis?.submittedAt,
    findingProblems: findingProblems(
      job.complaints.map((complaint) => complaint.id),
      job.findings,
    ),
    flaggedFindings: job.findings.filter((finding) => finding.possibleWarranty).length,
  };
}

/**
 * The side effects of a diagnosis stage action, run under the job lock after its gates passed and
 * before the stage writer moves the owner: sending the findings, returning them, or confirming.
 */
export async function applyDiagnosisAction(tx: Tx, id: string, action: StageAction, actor: StageActor, note: string | undefined) {
  const now = new Date();
  switch (action) {
    case "SEND_TO_ENGINEER":
      await tx.jobDiagnosis.upsert({
        where: { jobCardId: id },
        create: { jobCardId: id, submittedAt: now, submittedById: actor.id },
        update: { submittedAt: now, submittedById: actor.id },
      });
      return;
    case "RETURN_TO_TECHNICIAN":
      await tx.jobDiagnosis.update({
        where: { jobCardId: id },
        data: { submittedAt: null, submittedById: null, returnedAt: now, returnedById: actor.id, returnedNote: note ?? null },
      });
      return;
    case "SEND_TO_WARRANTY":
    case "SEND_TO_ADVISOR": {
      const route = action === "SEND_TO_WARRANTY" ? "WARRANTY" : "ESTIMATE";
      await tx.jobDiagnosis.update({ where: { jobCardId: id }, data: { confirmedAt: now, confirmedById: actor.id, route } });
      // The service engineer who certified the diagnosis is the job's engineer (MIS reports read it).
      if (actor.role === ROLES.ENGINEER) await tx.jobCard.update({ where: { id }, data: { engineerId: actor.id } });
      const branch = await tx.jobCard.findUniqueOrThrow({ where: { id }, select: { branchId: true } });
      await audit(tx, actor.id, "JOB_DIAGNOSIS_CONFIRMED", { jobCardId: id, branchId: branch.branchId, route });
      return;
    }
    default:
      return;
  }
}

/** The note recorded on the stage event for an action, for example why the warranty step was skipped. */
export function diagnosisEventNote(action: StageAction, note: string | undefined) {
  return action === "SEND_TO_ADVISOR" ? (note ?? WARRANTY_SKIPPED_REASON) : note;
}

const editJob = {
  id: true,
  branchId: true,
  jobType: true,
  stage: true,
  technicianId: true,
  diagnosis: { select: { submittedAt: true, returnedAt: true } },
} satisfies Prisma.JobCardSelect;
type EditJob = Prisma.JobCardGetPayload<{ select: typeof editJob }>;

/** Why this person cannot change the findings now, or null when they can. */
function editProblem(job: EditJob, actor: StageActor): { status: 403 | 409; message: string } | null {
  if (job.jobType === JobCardType.PDI) return { status: 409, message: "PDI job cards are updated from the PDI menu." };
  if (job.stage !== "DIAGNOSIS") return { status: 409, message: `Diagnosis is finished. This job is now at ${STAGE_LABELS[job.stage]}.` };
  const subStep = diagnosisSubStep(job.technicianId, job.diagnosis);
  if (subStep === "ASSIGN_TECHNICIAN") return { status: 409, message: "Assign a technician before recording findings." };
  if (canWorkDiagnosis(subStep, actor, job.technicianId)) return null;
  if (subStep === "ENGINEER_REVIEW")
    return { status: 409, message: "The service engineer is reviewing the findings. Ask them to return the job if something needs changing." };
  if (actor.role === ROLES.TECHNICIAN) return { status: 403, message: "Only the technician assigned to this job can record its findings." };
  return { status: 403, message: "Only the assigned technician or the workshop supervisor can record findings." };
}

async function lockForEdit(tx: Tx, id: string, actor: StageActor) {
  await lockJob(tx, id);
  const job = await tx.jobCard.findUnique({ where: { id }, select: editJob });
  if (!job) throw new NotFoundError("Job card not found");
  const problem = editProblem(job, actor);
  if (problem)
    throw (problem.status === 403 ? new ForbiddenError(problem.message) : new ConflictError(problem.message)).withCode("DIAGNOSIS_LOCKED");
  return job;
}

const fieldError = (field: string, message: string) => new BadRequestError(message).withCode("FIELD_VALIDATION", { field });

export class JobDiagnosisService {
  /** Everything the three diagnosis screens show, and what this person may do on them. */
  async get(id: string, actor: StageActor, options: { canUpdate: boolean }) {
    const job = await prisma.jobCard.findUnique({
      where: { id },
      select: {
        id: true,
        branchId: true,
        jobType: true,
        stage: true,
        technicianId: true,
        warrantyStatusAtCreation: true,
        technician: person,
        serviceAdvisor: person,
        bay: { select: { id: true, code: true, description: true } },
        checkIn: { select: { instructionsToTechnician: true } },
        complaints: { select: { id: true, description: true }, orderBy: { id: "asc" } },
        diagnosis: {
          select: {
            allocationNote: true,
            allocatedAt: true,
            submittedAt: true,
            returnedAt: true,
            returnedNote: true,
            confirmedAt: true,
            route: true,
            allocatedBy: person,
            submittedBy: person,
            returnedBy: person,
            confirmedBy: person,
          },
        },
        findings: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: findingSelect },
        warrantyCase: { select: { id: true } },
        _count: { select: { campaigns: true } },
      },
    });
    if (!job) throw new NotFoundError("Job card not found");
    const subStep: DiagnosisSubStep = diagnosisSubStep(job.technicianId, job.diagnosis);
    const atDiagnosis = job.stage === "DIAGNOSIS" && job.jobType !== JobCardType.PDI;
    const mayWork = options.canUpdate && atDiagnosis && canWorkDiagnosis(subStep, actor, job.technicianId);
    const engineers = await prisma.user.findMany({
      where: { isActive: true, branchId: job.branchId, role: { name: ROLES.ENGINEER } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { firstName: true, lastName: true },
      take: 3,
    });
    const flaggedFindings = job.findings.filter((finding) => finding.possibleWarranty).length;
    const routeFacts = {
      coverageActive: job.warrantyStatusAtCreation === WarrantyCoverageStatus.ACTIVE,
      openCampaigns: job._count.campaigns,
      warrantyCase: !!job.warrantyCase,
      flaggedFindings,
    };
    const d = job.diagnosis;
    return {
      jobCardId: job.id,
      subStep,
      // Findings: the technician (or supervisor) while recording; the engineer while reviewing.
      editable: mayWork && subStep !== "ASSIGN_TECHNICIAN",
      canAllocate: options.canUpdate && atDiagnosis && canAllocate(subStep, actor),
      technician: job.technician ? { id: job.technician.id, name: fullName(job.technician) } : null,
      bay: job.bay,
      allocation: d?.allocatedAt ? { note: d.allocationNote, by: fullName(d.allocatedBy), at: d.allocatedAt } : null,
      instructions: job.checkIn?.instructionsToTechnician?.trim() || null,
      advisorName: fullName(job.serviceAdvisor),
      requests: job.complaints.map((complaint, index) => ({ id: complaint.id, number: index + 1, description: complaint.description })),
      findings: job.findings.map(findingView),
      returned: isReturned(d ?? null) && d ? { note: d.returnedNote, by: fullName(d.returnedBy), at: d.returnedAt } : null,
      submitted: d?.submittedAt ? { by: fullName(d.submittedBy), at: d.submittedAt } : null,
      confirmed: d?.confirmedAt ? { by: fullName(d.confirmedBy), at: d.confirmedAt, route: d.route } : null,
      routing: { ...routeFacts, route: diagnosisRoute(routeFacts) },
      gates: findingProblems(
        job.complaints.map((complaint) => complaint.id),
        job.findings,
      ),
      engineers: engineers.map((engineer) => fullName(engineer)!),
    };
  }

  /**
   * Saves one finding whole (the autosave). The client picks the id; version 0 creates it.
   * A save made against an older version is refused so two screens never overwrite each other.
   */
  async saveFinding(id: string, findingId: string, input: unknown, actor: StageActor) {
    const body = findingBody.parse(input);
    return prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const existing = await tx.jobFinding.findUnique({ where: { id: findingId }, select: { jobCardId: true, complaintId: true, version: true } });
        if (existing && existing.jobCardId !== id) throw new NotFoundError("Finding not found");
        if (body.complaintId) {
          const complaint = await tx.jobComplaint.findFirst({ where: { id: body.complaintId, jobCardId: id }, select: { id: true } });
          if (!complaint) throw fieldError("complaintId", "Choose a customer request from this job");
        }
        if (existing) {
          if (existing.version !== body.expectedVersion)
            throw new ConflictError("This finding was changed on another screen. Load the latest to continue.").withCode("FINDING_VERSION");
          if (existing.complaintId !== body.complaintId) throw fieldError("complaintId", "A finding stays with its customer request");
        } else {
          if (body.expectedVersion !== 0)
            throw new ConflictError("This finding was removed on another screen. Load the latest to continue.").withCode("FINDING_VERSION");
          if (body.complaintId) {
            const other = await tx.jobFinding.findFirst({ where: { jobCardId: id, complaintId: body.complaintId }, select: { id: true } });
            if (other)
              throw new ConflictError("This request already has a finding from another screen. Load the latest to continue.").withCode("FINDING_VERSION");
          } else if ((await tx.jobFinding.count({ where: { jobCardId: id, complaintId: null } })) >= MAX_EXTRA_FINDINGS) {
            throw fieldError("complaintId", `A job can have up to ${MAX_EXTRA_FINDINGS} findings the customer did not mention`);
          }
        }

        const labourIds = body.items.filter((item) => item.kind === "LABOUR").map((item) => item.referenceId);
        const partIds = body.items.filter((item) => item.kind !== "LABOUR").map((item) => item.referenceId);
        const [labour, parts] = await Promise.all([
          labourIds.length ? tx.labourItem.findMany({ where: { id: { in: labourIds }, active: true }, select: { id: true, description: true } }) : [],
          partIds.length
            ? tx.sparePart.findMany({
                where: { id: { in: partIds }, partStatus: "ACTIVE" },
                select: { id: true, name: true, taxCategory: true, reportTaxCategoryCode: true },
              })
            : [],
        ]);
        const labourById = new Map(labour.map((row) => [row.id, row]));
        const partById = new Map(parts.map((row) => [row.id, row]));
        const items = body.items.map((item, index) => {
          if (item.kind === "LABOUR") {
            const row = labourById.get(item.referenceId);
            if (!row) throw fieldError(`items.${index}.referenceId`, "This work is no longer offered. Remove it and choose another.");
            return { kind: "LABOUR" as const, referenceId: row.id, description: row.description, quantity: new Prisma.Decimal(1), sortOrder: index };
          }
          const row = partById.get(item.referenceId);
          if (!row) throw fieldError(`items.${index}.referenceId`, "This part is blocked or no longer exists. Remove it and choose another.");
          return {
            kind: categoryOf(row) === "OIL" ? ("OIL" as const) : ("PART" as const),
            referenceId: row.id,
            description: row.name,
            quantity: new Prisma.Decimal(itemQuantity(item.kind, item.quantity)),
            sortOrder: index,
          };
        });

        const data = { causeAndDefect: body.causeAndDefect.trim(), possibleWarranty: body.possibleWarranty, updatedById: actor.id };
        if (existing) {
          await tx.jobFinding.update({ where: { id: findingId }, data: { ...data, version: { increment: 1 } } });
          await tx.jobFindingItem.deleteMany({ where: { findingId } });
        } else {
          await tx.jobFinding.create({ data: { ...data, id: findingId, jobCardId: id, complaintId: body.complaintId, createdById: actor.id } });
        }
        if (items.length) await tx.jobFindingItem.createMany({ data: items.map((item) => ({ ...item, findingId })) });
        const saved = await tx.jobFinding.findUniqueOrThrow({ where: { id: findingId }, select: findingSelect });
        await audit(tx, actor.id, "JOB_FINDING_SAVED", {
          jobCardId: id,
          branchId: job.branchId,
          findingId,
          complaintId: body.complaintId,
          created: !existing,
          version: saved.version,
          possibleWarranty: body.possibleWarranty,
          items: items.map((item) => ({ kind: item.kind, referenceId: item.referenceId, quantity: item.quantity.toString() })),
        });
        return findingView(saved);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /** Removes a finding the customer did not mention. A request's own finding is cleared, never removed. */
  async removeFinding(id: string, findingId: string, actor: StageActor) {
    await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const finding = await tx.jobFinding.findFirst({ where: { id: findingId, jobCardId: id }, select: { id: true, complaintId: true } });
        if (!finding) return;
        if (finding.complaintId)
          throw new ConflictError("A customer request keeps its finding. Clear the text instead.").withCode("FINDING_REQUIRED");
        await tx.jobFinding.delete({ where: { id: findingId } });
        await audit(tx, actor.id, "JOB_FINDING_REMOVED", { jobCardId: id, branchId: job.branchId, findingId });
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /** Adds a photo to a finding. Repeating the request ID returns the photo already stored. */
  async addFindingPhoto(id: string, findingId: string, input: unknown, actor: StageActor) {
    const body = findingPhotoBody.parse(input);
    let photo;
    try {
      photo = decodePhoto(body.image);
    } catch (error) {
      if (error instanceof PhotoProblem) throw fieldError("image", error.message);
      throw error;
    }
    return prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const replay = await tx.jobPhoto.findUnique({
          where: { jobCardId_requestId: { jobCardId: id, requestId: body.requestId } },
          select: { id: true, createdAt: true, findingId: true },
        });
        if (replay) return { id: replay.id, createdAt: replay.createdAt };
        const finding = await tx.jobFinding.findFirst({ where: { id: findingId, jobCardId: id }, select: { id: true, _count: { select: { photos: true } } } });
        if (!finding) throw new NotFoundError("Finding not found. Reload the page.");
        if (finding._count.photos >= MAX_PHOTOS_PER_FINDING)
          throw fieldError("image", `A finding can have up to ${MAX_PHOTOS_PER_FINDING} photos. Remove one first.`);
        const created = await tx.jobPhoto.create({
          data: {
            jobCardId: id,
            findingId,
            category: "FINDING",
            contentType: photo.contentType,
            byteSize: photo.data.length,
            width: photo.width,
            height: photo.height,
            sha256: photo.sha256,
            data: photo.data,
            requestId: body.requestId,
            createdById: actor.id,
          },
          select: { id: true, createdAt: true },
        });
        await audit(tx, actor.id, "JOB_PHOTO_ADDED", {
          jobCardId: id,
          branchId: job.branchId,
          photoId: created.id,
          category: "FINDING",
          findingId,
          byteSize: photo.data.length,
          sha256: photo.sha256,
        });
        return created;
      },
      { maxWait: 5000, timeout: 20000 },
    );
  }

  async removeFindingPhoto(id: string, findingId: string, photoId: string, actor: StageActor) {
    await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const photo = await tx.jobPhoto.findFirst({ where: { id: photoId, jobCardId: id, findingId }, select: { id: true } });
        if (!photo) return;
        await tx.jobPhoto.delete({ where: { id: photo.id } });
        await audit(tx, actor.id, "JOB_PHOTO_REMOVED", { jobCardId: id, branchId: job.branchId, photoId, category: "FINDING", findingId });
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * Work the technician can pick: labour operations with a rate for this vehicle's model. A vehicle
   * without a model, or a model with no labour set up, searches every active operation. No prices.
   */
  async labourOptions(id: string, q: string) {
    const job = await prisma.jobCard.findUnique({
      where: { id },
      select: { vehicle: { select: { catalogue: { select: { parentId: true, parent: { select: { description: true } } } } } } },
    });
    if (!job) throw new NotFoundError("Job card not found");
    const modelId = job.vehicle?.catalogue?.parentId ?? null;
    const modelHasLabour = modelId ? (await prisma.labourRate.count({ where: { modelId, active: true, labourItem: { active: true } } })) > 0 : false;
    const search = q
      ? { OR: [{ description: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }
      : {};
    const options = await prisma.labourItem.findMany({
      where: { active: true, ...search, ...(modelHasLabour ? { modelRates: { some: { modelId: modelId!, active: true } } } : {}) },
      orderBy: [{ description: "asc" }, { code: "asc" }],
      take: 20,
      select: { id: true, code: true, description: true },
    });
    return { scope: modelHasLabour ? "MODEL" : "ALL", model: job.vehicle?.catalogue?.parent?.description ?? null, options };
  }

  /** Active parts by number or name, with whether the part counts as oil. No prices or stock. */
  async partOptions(q: string) {
    const search = q
      ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { partNumber: { contains: q, mode: "insensitive" as const } }] }
      : {};
    const parts = await prisma.sparePart.findMany({
      where: { partStatus: "ACTIVE", ...search },
      orderBy: [{ name: "asc" }, { partNumber: "asc" }],
      take: 20,
      select: { id: true, partNumber: true, name: true, uom: true, taxCategory: true, reportTaxCategoryCode: true },
    });
    return {
      options: parts.map((part) => ({
        id: part.id,
        partNumber: part.partNumber,
        name: part.name,
        uom: part.uom,
        kind: categoryOf(part) === "OIL" ? "OIL" : "PART",
      })),
    };
  }

  /** Active bays with the job in the workshop that occupies each one, for the allocation select. */
  async bays(id: string) {
    const job = await prisma.jobCard.findUnique({ where: { id }, select: { branchId: true, bayId: true } });
    if (!job) throw new NotFoundError("Job card not found");
    const [bays, openJobs] = await Promise.all([
      prisma.workshopMaster.findMany({ where: { kind: "BAY", active: true }, orderBy: [{ code: "asc" }], select: { id: true, code: true, description: true } }),
      prisma.jobCard.findMany({
        where: { branchId: job.branchId, bayId: { not: null }, stage: { in: [...IN_WORKSHOP_STAGES] } },
        select: { id: true, jobNumber: true, bayId: true },
      }),
    ]);
    return {
      currentBayId: job.bayId,
      bays: bayStates(
        bays,
        openJobs.map((row) => ({ bayId: row.bayId, jobCardId: row.id, jobNumber: row.jobNumber })),
        id,
      ),
    };
  }
}
