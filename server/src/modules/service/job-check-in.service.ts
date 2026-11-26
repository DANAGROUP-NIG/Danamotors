import { JobCardType, Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/appError";
import { sumMoney } from "../finance/money";
import { ServiceTypeService } from "../workshop/service-type.service";
import { resolveJobComplaints, withOrderedIds } from "./job-card-complaints";
import {
  CHECKLIST_ITEMS,
  CHECK_IN_PHOTO_SLOTS,
  checkInGates,
  checkInStep,
  damageMarkBody,
  decodePhoto,
  detailsBody,
  mileageProblem,
  photoBody,
  PhotoProblem,
  readChecklist,
  requestsChanged,
  walkAroundBody,
  type CheckInGates,
} from "./job-check-in.logic";
import { openingConsentState } from "./job-opening-signature.service";
import { canWorkStage, STAGE_LABELS, type StageActor } from "./job-stage.logic";
import { serviceHistoryNote } from "./job-warranty.service";

type Tx = Prisma.TransactionClient;
type Database = Tx | typeof prisma;

const fullName = (user: { firstName: string; lastName: string } | null | undefined) =>
  user ? `${user.firstName} ${user.lastName}`.trim() : null;

const lockJob = (tx: Tx, id: string) => tx.$queryRaw(Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${id} FOR UPDATE`);

const editJob = {
  id: true,
  jobType: true,
  stage: true,
  technicianId: true,
  branchId: true,
  vehicleId: true,
  customerId: true,
  mileage: true,
  serviceTypeId: true,
  promisedAt: true,
  serviceCharge: true,
  estimatedParts: true,
  estimatedOil: true,
  estimatedLabour: true,
  warrantySnapshot: true,
} satisfies Prisma.JobCardSelect;
type EditJob = Prisma.JobCardGetPayload<{ select: typeof editJob }>;

/** Why this person cannot change check-in right now, or null when they can. */
function editProblem(job: Pick<EditJob, "jobType" | "stage" | "technicianId">, actor: StageActor): { status: 403 | 409; message: string } | null {
  if (job.jobType === JobCardType.PDI) return { status: 409, message: "PDI job cards are updated from the PDI menu." };
  if (job.stage !== "CHECK_IN")
    return { status: 409, message: `Check-in is finished. This job is now at ${STAGE_LABELS[job.stage]}.` };
  if (!canWorkStage("CHECK_IN", actor, job.technicianId))
    return { status: 403, message: "Only the service advisor can change check-in." };
  return null;
}

/** Locks the job and checks this person may change its check-in. Every check-in write starts here. */
async function lockForEdit(tx: Tx, id: string, actor: StageActor): Promise<EditJob> {
  await lockJob(tx, id);
  const job = await tx.jobCard.findUnique({ where: { id }, select: editJob });
  if (!job) throw new NotFoundError("Job card not found");
  const problem = editProblem(job, actor);
  if (problem)
    throw (problem.status === 403 ? new ForbiddenError(problem.message) : new ConflictError(problem.message)).withCode("CHECK_IN_LOCKED");
  return job;
}

function previousMileageOf(job: Pick<EditJob, "warrantySnapshot">): number | null {
  const snapshot = job.warrantySnapshot as { previousMileage?: unknown } | null;
  return typeof snapshot?.previousMileage === "number" ? snapshot.previousMileage : null;
}

const audit = (tx: Tx, userId: string, action: string, details: Record<string, unknown>) =>
  tx.auditLog.create({ data: { userId, action, details: JSON.stringify(details) } });

/** The facts the check-in gates need, for the step bar and SEND_TO_SUPERVISOR. */
export async function loadCheckInGates(db: Database, id: string, now: Date): Promise<CheckInGates> {
  const job = await db.jobCard.findUnique({
    where: { id },
    select: {
      mileage: true,
      serviceTypeId: true,
      promisedAt: true,
      _count: { select: { complaints: true } },
      checkIn: { select: { fuelLevel: true, checklist: true } },
    },
  });
  if (!job) throw new NotFoundError("Job card not found");
  return checkInGates(
    {
      mileage: job.mileage,
      serviceTypeId: job.serviceTypeId,
      promisedAt: job.promisedAt,
      complaintCount: job._count.complaints,
      fuelLevel: job.checkIn?.fuelLevel ?? null,
      checklist: readChecklist(job.checkIn?.checklist),
      consentState: await openingConsentState(db, id),
    },
    now,
  );
}

export class JobCheckInService {
  /** Everything the three check-in steps show. Photo bytes are never included; each photo has its own URL. */
  async get(id: string, actor: StageActor, options: { canUpdate: boolean; now?: Date }) {
    const now = options.now ?? new Date();
    const job = await prisma.jobCard.findUnique({
      where: { id },
      select: {
        ...editJob,
        createdAt: true,
        checkIn: true,
        damageMarks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        photos: { select: { id: true, category: true, slot: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        vehicle: { select: { customerId: true, customer: { select: { id: true, firstName: true, lastName: true, companyName: true } } } },
      },
    });
    if (!job) throw new NotFoundError("Job card not found");
    const [gates, consentState, previousVisit, completedBy] = await Promise.all([
      loadCheckInGates(prisma, id, now),
      openingConsentState(prisma, id),
      job.vehicleId
        ? prisma.jobCard.findFirst({
            where: { vehicleId: job.vehicleId, id: { not: id }, createdAt: { lt: job.createdAt }, mileage: { not: null }, stage: { not: "CANCELLED" } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { mileage: true, createdAt: true },
          })
        : null,
      job.checkIn?.completedById
        ? prisma.user.findUnique({ where: { id: job.checkIn.completedById }, select: { firstName: true, lastName: true } })
        : null,
    ]);
    // The service history verdict for the Details alert (warranty service rule, phase 4).
    const serviceHistory = await serviceHistoryNote(prisma, job);
    const previous = previousMileageOf(job);
    const problem = options.canUpdate ? editProblem(job, actor) : { status: 403 as const, message: "You can view check-in but not change it." };
    const owner = job.vehicle?.customer;
    return {
      jobCardId: job.id,
      editable: !problem,
      readOnlyReason: problem?.message ?? null,
      step: checkInStep(gates),
      gates,
      consentState,
      checklistItems: CHECKLIST_ITEMS,
      photoSlots: CHECK_IN_PHOTO_SLOTS,
      // The reading before this visit, which the mileage must not go below.
      previousReading:
        previous == null
          ? null
          : { km: previous, at: previousVisit && previousVisit.mileage === previous ? previousVisit.createdAt : null },
      serviceHistory,
      vehicleOwner: owner
        ? { id: owner.id, name: owner.companyName || [owner.firstName, owner.lastName].filter(Boolean).join(" ") }
        : null,
      record: {
        fuelLevel: job.checkIn?.fuelLevel ?? null,
        checklist: readChecklist(job.checkIn?.checklist),
        checklistNote: job.checkIn?.checklistNote ?? null,
        serviceBookSeen: job.checkIn?.serviceBookSeen ?? false,
        serviceBookStamps: job.checkIn?.serviceBookStamps ?? null,
        noValuables: job.checkIn?.noValuables ?? false,
        belongingsNote: job.checkIn?.belongingsNote ?? null,
        instructionsToTechnician: job.checkIn?.instructionsToTechnician ?? null,
        version: job.checkIn?.version ?? 0,
        savedAt: job.checkIn?.updatedAt ?? null,
        completedAt: job.checkIn?.completedAt ?? null,
        completedBy: fullName(completedBy),
      },
      damageMarks: job.damageMarks.map((mark) => ({
        id: mark.id,
        type: mark.type,
        x: mark.x.toNumber(),
        y: mark.y.toNumber(),
        note: mark.note,
        photoId: mark.photoId,
      })),
      photos: job.photos,
    };
  }

  /** Saves the Details step: bill-to, mileage, service type, promised delivery, requests and instructions. */
  async saveDetails(id: string, input: unknown, actor: StageActor) {
    const body = detailsBody.parse(input);
    const now = new Date();
    const promisedAt = new Date(body.promisedAt);
    if (promisedAt <= now)
      throw new BadRequestError("Promised delivery must be in the future").withCode("FIELD_VALIDATION", { field: "promisedAt" });

    await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const changed: string[] = [];
        const data: Prisma.JobCardUncheckedUpdateInput = {};

        if (body.customerId !== job.customerId) {
          const customer = await tx.customer.findFirst({ where: { id: body.customerId, mergedIntoId: null }, select: { id: true } });
          if (!customer) throw new BadRequestError("Choose an existing customer to bill").withCode("FIELD_VALIDATION", { field: "customerId" });
          if (await tx.estimate.count({ where: { jobCardId: id } }))
            throw new ConflictError("The bill-to customer cannot change after an estimate exists.").withCode("FIELD_VALIDATION", { field: "customerId" });
          data.customerId = body.customerId;
          changed.push("customerId");
        }

        if (body.mileage !== job.mileage) {
          const previous = previousMileageOf(job);
          const problem = mileageProblem(body.mileage, previous, body.odometerReplaced);
          if (problem) throw new BadRequestError(problem).withCode("FIELD_VALIDATION", { field: "mileage" });
          data.mileage = body.mileage;
          changed.push("mileage");
          if (job.vehicleId) {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "Vehicle" WHERE id = ${job.vehicleId} FOR UPDATE`);
            const vehicle = await tx.vehicle.findUnique({ where: { id: job.vehicleId }, select: { lastRecordedMileage: true } });
            // Only correct the vehicle's reading when this job set it; a later visit's reading stays.
            if (vehicle && (vehicle.lastRecordedMileage == null || vehicle.lastRecordedMileage === job.mileage))
              await tx.vehicle.update({
                where: { id: job.vehicleId },
                data: {
                  lastRecordedMileage: body.odometerReplaced ? body.mileage : Math.max(previous ?? 0, body.mileage),
                  lastMileageAt: now,
                },
              });
          }
        }

        if (body.serviceTypeId !== job.serviceTypeId) {
          if (!job.vehicleId) throw new BadRequestError("Add the vehicle before choosing a service type").withCode("FIELD_VALIDATION", { field: "serviceTypeId" });
          let option;
          try {
            option = await new ServiceTypeService().requireAvailable(tx, job.vehicleId, body.serviceTypeId, now, job.jobType);
          } catch (error) {
            if (error instanceof BadRequestError || error instanceof NotFoundError)
              throw new BadRequestError("Choose a service type available for this vehicle").withCode("FIELD_VALIDATION", { field: "serviceTypeId" });
            throw error;
          }
          // The service charge follows the service type, as at opening.
          // TODO(confirm): JobCard.serviceCharge and the opening estimate move to Decimal with the estimate in phase 5.
          const serviceCharge = option.serviceCharge ?? null;
          data.serviceTypeId = body.serviceTypeId;
          data.serviceCharge = serviceCharge;
          data.estimatedCost = sumMoney([job.estimatedParts ?? 0, job.estimatedOil ?? 0, job.estimatedLabour ?? 0, serviceCharge ?? 0]);
          changed.push("serviceTypeId");
        }

        if (!job.promisedAt || job.promisedAt.getTime() !== promisedAt.getTime()) {
          data.promisedAt = promisedAt;
          changed.push("promisedAt");
        }

        const current = await tx.jobComplaint.findMany({ where: { jobCardId: id }, orderBy: { id: "asc" } });
        if (requestsChanged(current, body.complaints)) {
          const rows = await resolveJobComplaints(
            tx,
            body.complaints.map((row) => ({ ...row, complaintCodeId: row.complaintCodeId ?? undefined })),
          ).catch((error: unknown) => {
            if (error instanceof BadRequestError) throw error.withCode("FIELD_VALIDATION", { field: "complaints" });
            throw error;
          });
          await tx.jobComplaint.deleteMany({ where: { jobCardId: id } });
          await tx.jobComplaint.createMany({ data: withOrderedIds(rows).map((row) => ({ ...row, jobCardId: id })) });
          changed.push("complaints");
        }

        if (Object.keys(data).length) await tx.jobCard.update({ where: { id }, data });

        const existing = await tx.jobCheckIn.findUnique({ where: { jobCardId: id }, select: { instructionsToTechnician: true } });
        if ((existing?.instructionsToTechnician ?? null) !== body.instructionsToTechnician) {
          await tx.jobCheckIn.upsert({
            where: { jobCardId: id },
            create: { jobCardId: id, instructionsToTechnician: body.instructionsToTechnician, updatedById: actor.id },
            update: { instructionsToTechnician: body.instructionsToTechnician, updatedById: actor.id },
          });
          changed.push("instructionsToTechnician");
        }

        if (changed.length)
          await audit(tx, actor.id, "JOB_CHECK_IN_DETAILS_SAVED", {
            jobCardId: id,
            branchId: job.branchId,
            changed,
            ...(changed.includes("mileage") && {
              mileage: { from: job.mileage, to: body.mileage },
              odometerReplaced: Boolean(body.odometerReplaced),
              odometerReplacedReason: body.odometerReplaced ? body.odometerReplacedReason?.trim() : null,
            }),
            ...(changed.includes("customerId") && { customer: { from: job.customerId, to: body.customerId } }),
          });
      },
      { maxWait: 5000, timeout: 15000 },
    );
    return this.get(id, actor, { canUpdate: true, now });
  }

  /**
   * Autosaves the walk-around draft. The client sends the version it last saw; a newer save from
   * another screen is refused (409) rather than silently overwritten.
   */
  async saveWalkAround(id: string, input: unknown, actor: StageActor) {
    const body = walkAroundBody.parse(input);
    const saved = await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const existing = await tx.jobCheckIn.findUnique({ where: { jobCardId: id }, select: { version: true } });
        if ((existing?.version ?? 0) !== body.expectedVersion)
          throw new ConflictError("The walk-around was changed on another screen. Reload to see the latest version.").withCode("CHECK_IN_VERSION");
        const { expectedVersion: _expectedVersion, ...fields } = body;
        const record = await tx.jobCheckIn.upsert({
          where: { jobCardId: id },
          create: { jobCardId: id, ...fields, version: 1, updatedById: actor.id },
          update: { ...fields, version: { increment: 1 }, updatedById: actor.id },
          select: { version: true, updatedAt: true },
        });
        await audit(tx, actor.id, "JOB_WALK_AROUND_SAVED", { jobCardId: id, branchId: job.branchId, version: record.version });
        return record;
      },
      { maxWait: 5000, timeout: 15000 },
    );
    return { version: saved.version, savedAt: saved.updatedAt };
  }

  /** Places a damage mark. Repeating the request ID returns the mark already placed. */
  async addDamageMark(id: string, input: unknown, actor: StageActor) {
    const body = damageMarkBody.parse(input);
    return prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const replay = await tx.jobDamageMark.findUnique({ where: { jobCardId_requestId: { jobCardId: id, requestId: body.requestId } } });
        if (replay) return markView(replay);
        if (body.photoId) {
          const photo = await tx.jobPhoto.findFirst({
            where: { id: body.photoId, jobCardId: id, category: "DAMAGE" },
            select: { id: true, damageMark: { select: { id: true } } },
          });
          if (!photo || photo.damageMark)
            throw new BadRequestError("Choose a damage photo saved on this job").withCode("FIELD_VALIDATION", { field: "photoId" });
        }
        const mark = await tx.jobDamageMark.create({
          data: {
            jobCardId: id,
            type: body.type,
            x: new Prisma.Decimal(body.x),
            y: new Prisma.Decimal(body.y),
            note: body.note,
            photoId: body.photoId,
            requestId: body.requestId,
            createdById: actor.id,
          },
        });
        await audit(tx, actor.id, "JOB_DAMAGE_MARK_ADDED", { jobCardId: id, branchId: job.branchId, markId: mark.id, type: mark.type });
        return markView(mark);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /** Removes a damage mark and its photo. Removing a mark that is already gone succeeds. */
  async removeDamageMark(id: string, markId: string, actor: StageActor) {
    await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const mark = await tx.jobDamageMark.findFirst({ where: { id: markId, jobCardId: id } });
        if (!mark) return;
        await tx.jobDamageMark.delete({ where: { id: mark.id } });
        if (mark.photoId) await tx.jobPhoto.delete({ where: { id: mark.photoId } });
        await audit(tx, actor.id, "JOB_DAMAGE_MARK_REMOVED", { jobCardId: id, branchId: job.branchId, markId, type: mark.type, photoId: mark.photoId });
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /**
   * Stores a photo. A check-in slot holds one photo, so a new one replaces the old.
   * Repeating the request ID returns the photo already stored.
   */
  async addPhoto(id: string, input: unknown, actor: StageActor) {
    const body = photoBody.parse(input);
    let photo;
    try {
      photo = decodePhoto(body.image);
    } catch (error) {
      if (error instanceof PhotoProblem) throw new BadRequestError(error.message).withCode("FIELD_VALIDATION", { field: "image" });
      throw error;
    }
    return prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const replay = await tx.jobPhoto.findUnique({
          where: { jobCardId_requestId: { jobCardId: id, requestId: body.requestId } },
          select: photoSelect,
        });
        if (replay) return replay;
        const slot = body.category === "CHECK_IN" ? body.slot ?? null : null;
        const replaced = slot
          ? await tx.jobPhoto.findMany({ where: { jobCardId: id, category: "CHECK_IN", slot }, select: { id: true } })
          : [];
        if (replaced.length) await tx.jobPhoto.deleteMany({ where: { id: { in: replaced.map((row) => row.id) } } });
        const created = await tx.jobPhoto.create({
          data: {
            jobCardId: id,
            category: body.category,
            slot,
            contentType: photo.contentType,
            byteSize: photo.data.length,
            width: photo.width,
            height: photo.height,
            sha256: photo.sha256,
            data: photo.data,
            requestId: body.requestId,
            createdById: actor.id,
          },
          select: photoSelect,
        });
        await audit(tx, actor.id, "JOB_PHOTO_ADDED", {
          jobCardId: id,
          branchId: job.branchId,
          photoId: created.id,
          category: body.category,
          slot,
          byteSize: photo.data.length,
          sha256: photo.sha256,
          replacedPhotoIds: replaced.map((row) => row.id),
        });
        return created;
      },
      { maxWait: 5000, timeout: 20000 },
    );
  }

  async removePhoto(id: string, photoId: string, actor: StageActor) {
    await prisma.$transaction(
      async (tx) => {
        const job = await lockForEdit(tx, id, actor);
        const photo = await tx.jobPhoto.findFirst({ where: { id: photoId, jobCardId: id }, select: { id: true, category: true, slot: true } });
        if (!photo) return;
        await tx.jobPhoto.delete({ where: { id: photo.id } });
        await audit(tx, actor.id, "JOB_PHOTO_REMOVED", { jobCardId: id, branchId: job.branchId, photoId, category: photo.category, slot: photo.slot });
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  /** The photo bytes, for the photo endpoint only. */
  async readPhoto(id: string, photoId: string) {
    const photo = await prisma.jobPhoto.findFirst({ where: { id: photoId, jobCardId: id }, select: { data: true, contentType: true, sha256: true } });
    if (!photo) throw new NotFoundError("Photo not found");
    return photo;
  }
}

const photoSelect = { id: true, category: true, slot: true, createdAt: true } satisfies Prisma.JobPhotoSelect;

function markView(mark: { id: string; type: string; x: Prisma.Decimal; y: Prisma.Decimal; note: string | null; photoId: string | null }) {
  return { id: mark.id, type: mark.type, x: mark.x.toNumber(), y: mark.y.toNumber(), note: mark.note, photoId: mark.photoId };
}
