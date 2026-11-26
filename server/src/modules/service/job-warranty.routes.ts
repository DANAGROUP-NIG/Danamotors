import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { decisionsBody, outsideRecordBody, removeRecordBody } from "./job-warranty.logic";
import { JobWarrantyService, type WarrantyAccess } from "./job-warranty.service";

const service = new JobWarrantyService();
const actor = (req: Request) => ({ id: req.user!.userId, role: req.user!.role });
const has = (req: Request, permission: string) =>
  req.user!.role === ROLES.SUPER_ADMIN || req.user!.permissions.includes(permission);
const access = (req: Request): WarrantyAccess => ({
  canUpdate: has(req, PERMISSIONS.JOBCARD_UPDATE),
  canDecide: has(req, PERMISSIONS.WARRANTY_UPDATE),
});
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });
const recordParams = jobParams.extend({ recordId: z.string().uuid("Reload the page and try again") });

/** Every warranty check route: the job must exist and be in a branch this person can work in. */
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
 * /api/service/job-cards/{id}/warranty:
 *   get:
 *     tags: [Service]
 *     summary: Warranty check for the staged job card (coverage, service history, campaigns, items to decide)
 *     description: 'Requires jobcard:read, warranty:read and branch access. Coverage as of the job opening (time and distance used), the service history rule result (warranty years split into periods, each ON_TIME, MISSED, UPCOMING or NOT_DUE, the missed services, the verdict REGULAR, IRREGULAR or INSUFFICIENT_DATA with a sentence and how to fix missing data), outside service records, linked campaigns, every diagnosed item with the technician note and its payer (WARRANTY, GOODWILL, CAMPAIGN or CUSTOMER), the decision reason, whether it is needed, what stops the handoff, and whether this person may decide (the warranty officer with jobcard:update and warranty:update while the job is at the warranty check).'
 *     responses:
 *       200: { description: 'status=success, data=warranty check' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 *   put:
 *     tags: [Service]
 *     summary: Save who pays for items, and the decision reason
 *     description: 'Requires jobcard:update and warranty:update, a warranty role, and the job at the warranty check. Body: items (itemId, payer, campaignId for CAMPAIGN when the job has more than one linked campaign) and optional reason (null clears it). Each decision follows the job card line rules: WARRANTY needs cover at opening or a warranty case and a warranty-applicable part; GOODWILL needs warranty:update; CAMPAIGN needs a linked campaign. A refused decision returns 400 FIELD_VALIDATION naming the item. Audited as JOB_WARRANTY_DECISIONS_SAVED.'
 *     responses:
 *       200: { description: The warranty check after saving }
 *       400: { description: Invalid fields. Errors name the field and the fix. }
 *       403: { description: 'Not the warranty officer (code WARRANTY_LOCKED)' }
 *       409: { description: 'Job past the warranty check (WARRANTY_LOCKED)' }
 * /api/service/job-cards/{id}/warranty/outside-services:
 *   post:
 *     tags: [Service]
 *     summary: Add a service done at another authorised dealer
 *     description: 'Requires warranty:update. Body: requestId (a repeat returns the stored record), serviceDate (YYYY-MM-DD, not in the future, not before the sale), mileage, dealerName, note, and image (JPEG, PNG or WebP data URL of the stamped service book, at most 2 MB). The record belongs to the vehicle and counts in the service history rule. Audited as EXTERNAL_SERVICE_RECORD_ADDED without the image.'
 *     responses:
 *       200: { description: The warranty check after adding }
 *       400: { description: Invalid fields }
 * /api/service/job-cards/{id}/warranty/outside-services/{recordId}:
 *   delete:
 *     tags: [Service]
 *     summary: Remove an outside service record (soft delete)
 *     description: 'Requires warranty:update; only the person who added it or an admin. Body: reason. Audited as EXTERNAL_SERVICE_RECORD_REMOVED.'
 *     responses:
 *       200: { description: The warranty check after removing }
 *       403: { description: Not the person who added it or an admin }
 */
export const jobWarrantyRoutes = Router({ mergeParams: true });
jobWarrantyRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), requirePermission(PERMISSIONS.WARRANTY_READ), jobBranchAccess);

jobWarrantyRoutes.get(
  "/",
  validateRequest(z.object({ params: jobParams })),
  handle((req) => service.get(req.params.id, actor(req), access(req))),
);
jobWarrantyRoutes.put(
  "/",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  requirePermission(PERMISSIONS.WARRANTY_UPDATE),
  validateRequest(z.object({ params: jobParams, body: decisionsBody })),
  handle((req) => service.saveDecisions(req.params.id, req.body, actor(req), access(req)), "Decisions saved"),
);
jobWarrantyRoutes.post(
  "/outside-services",
  requirePermission(PERMISSIONS.WARRANTY_UPDATE),
  validateRequest(z.object({ params: jobParams, body: outsideRecordBody })),
  handle((req) => service.addOutsideRecord(req.params.id, req.body, actor(req), access(req)), "Outside service record added"),
);
jobWarrantyRoutes.delete(
  "/outside-services/:recordId",
  requirePermission(PERMISSIONS.WARRANTY_UPDATE),
  validateRequest(z.object({ params: recordParams, body: removeRecordBody })),
  handle(
    (req) => service.removeOutsideRecord(req.params.id, req.params.recordId, req.body, actor(req), access(req)),
    "Outside service record removed",
  ),
);
