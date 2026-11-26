import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { damageMarkBody, detailsBody, photoBody, walkAroundBody } from "./job-check-in.logic";
import { JobCheckInService } from "./job-check-in.service";

const service = new JobCheckInService();
const actor = (req: Request) => ({ id: req.user!.userId, role: req.user!.role });
const canUpdate = (req: Request) =>
  req.user!.role === ROLES.SUPER_ADMIN || req.user!.permissions.includes(PERMISSIONS.JOBCARD_UPDATE);
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });

/** Every check-in and photo route: the job must exist and be in a branch this person can work in. */
async function jobBranchAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    jobParams.parse(req.params);
    const job = await prisma.jobCard.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
    if (!job) throw new NotFoundError("Job card not found");
    assertBranchOwnership(req, job.branchId);
    next();
  } catch (error) {
    next(error);
  }
}

const handle =
  (run: (req: Request) => Promise<unknown>, message?: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ status: "success", statusCode: 200, ...(message && { message }), data: await run(req) });
    } catch (error) {
      next(error);
    }
  };

/**
 * @openapi
 * /api/service/job-cards/{id}/check-in:
 *   get:
 *     tags: [Service]
 *     summary: Check-in (Details, Walk-around, Customer consent) for the staged job card
 *     description: Requires jobcard:read and branch access. Returns the walk-around record, damage marks, photo list (no image data), the 25 checklist items, the reading before this visit, the gate reasons per step, the consent state and whether this person may edit (service advisor roles with jobcard:update while the job is at check-in).
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: 'status=success, data=check-in' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 * /api/service/job-cards/{id}/check-in/details:
 *   put:
 *     tags: [Service]
 *     summary: Save the Details step
 *     description: 'Requires jobcard:update, a service advisor role and the job at check-in. Body: customerId (bill to), mileage, odometerReplaced and odometerReplacedReason, serviceTypeId, promisedAt (future, with offset), complaints (1 to 100: description, complaintCodeId, amounts kept), instructionsToTechnician. Mileage below the reading before this visit needs odometerReplaced and a reason. Audited as JOB_CHECK_IN_DETAILS_SAVED.'
 *     responses:
 *       200: { description: Saved check-in }
 *       400: { description: Invalid fields. Errors name the field and the fix. }
 *       403: { description: 'Not a service advisor role (code CHECK_IN_LOCKED)' }
 *       409: { description: 'Check-in finished (CHECK_IN_LOCKED), or bill-to change after an estimate' }
 * /api/service/job-cards/{id}/check-in/walk-around:
 *   put:
 *     tags: [Service]
 *     summary: Autosave the walk-around draft
 *     description: 'Whole draft each time: expectedVersion, fuelLevel (EMPTY, QUARTER, HALF, THREE_QUARTER, FULL or null), checklist (item code to PRESENT, MISSING or NOT_WORKING), checklistNote, serviceBookSeen, serviceBookStamps (0 to 12), noValuables, belongingsNote. A save based on an older version returns 409 CHECK_IN_VERSION. Audited as JOB_WALK_AROUND_SAVED.'
 *     responses:
 *       200: { description: 'data.version and data.savedAt' }
 *       409: { description: 'CHECK_IN_VERSION or CHECK_IN_LOCKED' }
 * /api/service/job-cards/{id}/check-in/damage-marks:
 *   post:
 *     tags: [Service]
 *     summary: Place a damage mark on the top-down diagram
 *     description: 'requestId (repeat returns the same mark), type CRACK, DENT or SCRATCH, x and y as percentages 0 to 100, optional note and a DAMAGE photoId from this job.'
 *     responses:
 *       200: { description: The mark }
 * /api/service/job-cards/{id}/check-in/damage-marks/{markId}:
 *   delete:
 *     tags: [Service]
 *     summary: Remove a damage mark and its photo
 *     responses:
 *       200: { description: Removed, or already gone }
 */
export const jobCheckInRoutes = Router({ mergeParams: true });
jobCheckInRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

jobCheckInRoutes.get(
  "/",
  handle((req) => service.get(req.params.id, actor(req), { canUpdate: canUpdate(req) })),
);
jobCheckInRoutes.put(
  "/details",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: detailsBody })),
  handle((req) => service.saveDetails(req.params.id, req.body, actor(req)), "Check-in details saved"),
);
jobCheckInRoutes.put(
  "/walk-around",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: walkAroundBody })),
  handle((req) => service.saveWalkAround(req.params.id, req.body, actor(req)), "Walk-around saved"),
);
jobCheckInRoutes.post(
  "/damage-marks",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: damageMarkBody })),
  handle((req) => service.addDamageMark(req.params.id, req.body, actor(req)), "Damage mark added"),
);
jobCheckInRoutes.delete(
  "/damage-marks/:markId",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams.extend({ markId: z.string().uuid("Choose a damage mark") }) })),
  handle(async (req) => {
    await service.removeDamageMark(req.params.id, req.params.markId, actor(req));
    return null;
  }, "Damage mark removed"),
);

/**
 * @openapi
 * /api/service/job-cards/{id}/photos:
 *   post:
 *     tags: [Service]
 *     summary: Store a job photo
 *     description: 'Requires jobcard:update, a service advisor role and the job at check-in. Body: requestId (repeat returns the same photo), category CHECK_IN (with slot FRONT, REAR, LEFT, RIGHT or ODOMETER; replaces that slot) or DAMAGE, image as a JPEG, PNG or WebP data URL, at most 2 MB and 4096 pixels a side. Bytes are stored in the database and never returned by job or check-in responses. Audited as JOB_PHOTO_ADDED with size and SHA-256, never the image.'
 *     responses:
 *       200: { description: 'Photo id, category, slot and createdAt' }
 *       400: { description: 'Wrong type, too large or unreadable (field image)' }
 * /api/service/job-cards/{id}/photos/{photoId}:
 *   get:
 *     tags: [Service]
 *     summary: The photo image
 *     description: Requires jobcard:read and branch access. Returns the image bytes with their content type.
 *     responses:
 *       200: { description: Image }
 *       404: { description: Photo not found }
 *   delete:
 *     tags: [Service]
 *     summary: Remove a photo while the job is at check-in
 *     responses:
 *       200: { description: Removed, or already gone }
 */
export const jobPhotoRoutes = Router({ mergeParams: true });
jobPhotoRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);
const photoParams = jobParams.extend({ photoId: z.string().uuid("Choose a photo") });

jobPhotoRoutes.post(
  "/",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: photoBody })),
  handle((req) => service.addPhoto(req.params.id, req.body, actor(req)), "Photo saved"),
);
jobPhotoRoutes.get("/:photoId", validateRequest(z.object({ params: photoParams })), async (req, res, next) => {
  try {
    const photo = await service.readPhoto(req.params.id, req.params.photoId);
    // A photo never changes once stored, so the browser may keep it.
    res.set({
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=86400, immutable",
      ETag: `"${photo.sha256}"`,
      "X-Content-Type-Options": "nosniff",
    });
    res.send(Buffer.from(photo.data));
  } catch (error) {
    next(error);
  }
});
jobPhotoRoutes.delete(
  "/:photoId",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: photoParams })),
  handle(async (req) => {
    await service.removePhoto(req.params.id, req.params.photoId, actor(req));
    return null;
  }, "Photo removed"),
);
