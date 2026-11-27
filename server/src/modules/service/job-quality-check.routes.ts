import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { qualityCheckBody } from "./job-quality-check.logic";
import { JobQualityCheckService } from "./job-quality-check.service";
import type { RepairActor } from "./job-repair.service";

const service = new JobQualityCheckService();
const actor = (req: Request): RepairActor => ({ id: req.user!.userId, role: req.user!.role, permissions: req.user!.permissions, branchId: req.user!.branchId ?? null });
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });

/** The job must exist and be in a branch this person can work in. */
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
 * /api/service/job-cards/{id}/quality-check:
 *   get:
 *     tags: [Service]
 *     summary: The quality check step (job card revamp phase 7)
 *     description: 'Requires jobcard:read and branch access. The approved work lines, the general checks (codes and labels), the certification statement, the check-in odometer as the road test start, every inspection on the job (result PASSED or FAILED, current or superseded, inspector, notes, failed lines, general checks, road test, AC outlet temperature, certified by and when; never the signature image), the job''s QC state (PENDING, PASSED, FAILED, NOT_REQUIRED) and whether this person may record the check.'
 *     responses:
 *       200: { description: 'status=success, data=quality check step' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 *   post:
 *     tags: [Service]
 *     summary: Pass or fail the quality check
 *     description: 'Requires jobcard:update and qcstatus:update; the workshop supervisor or service manager roles; job at Quality check. Body { requestId, outcome: PASS | FAIL, lines: [{ workLineId, result: PASS | FAIL }], general: [{ code, passed }], acOutletTempC (0 to 40, nullable), roadTestStartKm, roadTestEndKm (end at least start), roadTestNotes, notes, signatureImage (PNG data URL) }. PASS needs every line PASS, every general check, both km and the signature (409 QC_BLOCKED with reasons); it records the passed inspection with the signed certification and moves the job to Billing with the service advisor (status stays QC). FAIL needs notes and at least one failed line (400 naming the field); it records the failed inspection, returns the job to Repair (IN_PROGRESS), reopens the failed lines and notifies the technician. A repeated requestId records once.'
 *     responses:
 *       200: { description: 'status=success, data=quality check step' }
 *       400: { description: Invalid input naming the field }
 *       403: { description: Not a supervisor or service manager (QC_FORBIDDEN) }
 *       409: { description: 'Pass not possible yet, or the job is not at the quality check (QC_BLOCKED, reasons in details)' }
 */
export const jobQualityCheckRoutes = Router({ mergeParams: true });
jobQualityCheckRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

jobQualityCheckRoutes.get("/", validateRequest(z.object({ params: jobParams })), handle((req) => service.view(req.params.id, actor(req))));
jobQualityCheckRoutes.post(
  "/",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  requirePermission(PERMISSIONS.QCSTATUS_UPDATE),
  validateRequest(z.object({ params: jobParams, body: qualityCheckBody })),
  handle((req) => service.record(req.params.id, actor(req), qualityCheckBody.parse(req.body)), "Quality check recorded"),
);
