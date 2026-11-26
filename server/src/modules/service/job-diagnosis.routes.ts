import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { findingBody, findingPhotoBody, optionsQuery } from "./job-diagnosis.logic";
import { JobDiagnosisService } from "./job-diagnosis.service";

const service = new JobDiagnosisService();
const actor = (req: Request) => ({ id: req.user!.userId, role: req.user!.role });
const canUpdate = (req: Request) =>
  req.user!.role === ROLES.SUPER_ADMIN || req.user!.permissions.includes(PERMISSIONS.JOBCARD_UPDATE);
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });
const findingParams = jobParams.extend({ findingId: z.string().uuid("Reload the page and try again") });
const photoParams = findingParams.extend({ photoId: z.string().uuid("Choose a photo") });

/** Every diagnosis route: the job must exist and be in a branch this person can work in. */
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
 * /api/service/job-cards/{id}/diagnosis:
 *   get:
 *     tags: [Service]
 *     summary: Diagnosis for the staged job card (allocation, findings, engineer review)
 *     description: 'Requires jobcard:read and branch access. Returns the sub-step (ASSIGN_TECHNICIAN, FINDINGS, ENGINEER_REVIEW), technician, bay, allocation note, the advisor instructions, the customer requests, the findings with work and parts needed (no prices) and photo ids, the engineer return note, submission and confirmation, routing facts and route (WARRANTY or ESTIMATE), the findings gate reasons, the branch engineers, and whether this person may edit findings or allocate.'
 *     responses:
 *       200: { description: 'status=success, data=diagnosis' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 * /api/service/job-cards/{id}/diagnosis/bays:
 *   get:
 *     tags: [Service]
 *     summary: Active bays, free or occupied by another job in the workshop
 *     responses:
 *       200: { description: 'currentBayId and bays (id, code, description, occupiedBy job number or null)' }
 * /api/service/job-cards/{id}/diagnosis/labour-options:
 *   get:
 *     tags: [Service]
 *     summary: Work the technician can add (labour operations of the vehicle model), without prices
 *     parameters:
 *       - { in: query, name: q, schema: { type: string, maxLength: 80 } }
 *     responses:
 *       200: { description: 'scope MODEL or ALL, model name, up to 20 options (id, code, description)' }
 * /api/service/job-cards/{id}/diagnosis/part-options:
 *   get:
 *     tags: [Service]
 *     summary: Active spare parts by number or name, without prices or stock
 *     parameters:
 *       - { in: query, name: q, schema: { type: string, maxLength: 80 } }
 *     responses:
 *       200: { description: 'Up to 20 options (id, partNumber, name, uom, kind PART or OIL)' }
 * /api/service/job-cards/{id}/diagnosis/findings/{findingId}:
 *   put:
 *     tags: [Service]
 *     summary: Save one finding (autosave)
 *     description: 'Requires jobcard:update; the assigned technician or the workshop supervisor while recording findings, the service engineer while reviewing. The client chooses findingId; expectedVersion 0 creates it. Body: complaintId (null for a finding the customer did not mention), causeAndDefect, possibleWarranty, items (kind LABOUR, PART or OIL, referenceId, quantity; labour is always 1; PART or OIL is decided from the part tax category). An older expectedVersion returns 409 FINDING_VERSION. Audited as JOB_FINDING_SAVED.'
 *     responses:
 *       200: { description: Saved finding }
 *       400: { description: Invalid fields. Errors name the field and the fix. }
 *       403: { description: 'Not the assigned technician or supervisor (code DIAGNOSIS_LOCKED)' }
 *       409: { description: 'Job past diagnosis, engineer reviewing (DIAGNOSIS_LOCKED) or a newer save (FINDING_VERSION)' }
 *   delete:
 *     tags: [Service]
 *     summary: Remove a finding the customer did not mention
 *     responses:
 *       200: { description: Removed, or already gone }
 *       409: { description: 'A customer request keeps its finding (FINDING_REQUIRED)' }
 * /api/service/job-cards/{id}/diagnosis/findings/{findingId}/photos:
 *   post:
 *     tags: [Service]
 *     summary: Add a photo to a finding (at most 6)
 *     description: 'Body: requestId (repeat returns the same photo) and image as a JPEG, PNG or WebP data URL, at most 2 MB and 4096 pixels a side. The image is read from GET /api/service/job-cards/{id}/photos/{photoId}. Audited as JOB_PHOTO_ADDED without the image.'
 *     responses:
 *       200: { description: Photo id and createdAt }
 *       400: { description: 'Wrong type, too large, unreadable, or 6 photos already (field image)' }
 * /api/service/job-cards/{id}/diagnosis/findings/{findingId}/photos/{photoId}:
 *   delete:
 *     tags: [Service]
 *     summary: Remove a finding photo
 *     responses:
 *       200: { description: Removed, or already gone }
 */
export const jobDiagnosisRoutes = Router({ mergeParams: true });
jobDiagnosisRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

jobDiagnosisRoutes.get(
  "/",
  validateRequest(z.object({ params: jobParams })),
  handle((req) => service.get(req.params.id, actor(req), { canUpdate: canUpdate(req) })),
);
jobDiagnosisRoutes.get("/bays", validateRequest(z.object({ params: jobParams })), handle((req) => service.bays(req.params.id)));
jobDiagnosisRoutes.get(
  "/labour-options",
  validateRequest(z.object({ params: jobParams, query: optionsQuery })),
  handle((req) => service.labourOptions(req.params.id, optionsQuery.parse(req.query).q)),
);
jobDiagnosisRoutes.get(
  "/part-options",
  validateRequest(z.object({ params: jobParams, query: optionsQuery })),
  handle((req) => service.partOptions(optionsQuery.parse(req.query).q)),
);
jobDiagnosisRoutes.put(
  "/findings/:findingId",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: findingParams, body: findingBody })),
  handle((req) => service.saveFinding(req.params.id, req.params.findingId, req.body, actor(req)), "Finding saved"),
);
jobDiagnosisRoutes.delete(
  "/findings/:findingId",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: findingParams })),
  handle(async (req) => {
    await service.removeFinding(req.params.id, req.params.findingId, actor(req));
    return null;
  }, "Finding removed"),
);
jobDiagnosisRoutes.post(
  "/findings/:findingId/photos",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: findingParams, body: findingPhotoBody })),
  handle((req) => service.addFindingPhoto(req.params.id, req.params.findingId, req.body, actor(req)), "Photo saved"),
);
jobDiagnosisRoutes.delete(
  "/findings/:findingId/photos/:photoId",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: photoParams })),
  handle(async (req) => {
    await service.removeFindingPhoto(req.params.id, req.params.findingId, req.params.photoId, actor(req));
    return null;
  }, "Photo removed"),
);
