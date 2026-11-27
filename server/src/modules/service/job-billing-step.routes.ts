import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { readyNoticeBody, washedBody } from "./job-billing-step.logic";
import { JobBillingStepService } from "./job-billing-step.service";
import type { RepairActor } from "./job-repair.service";

const service = new JobBillingStepService();
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
 * /api/service/job-cards/{id}/billing:
 *   get:
 *     tags: [Service]
 *     summary: The Billing step (job card revamp phase 8)
 *     description: 'Requires jobcard:read and branch access. Ready notices (channel PHONE_CALL or SMS, phone, note, who and when, newest first), the storage counter (terms clause 3: first notice, free until, days and proposed amount at the branch rate), the vehicle washed tick, estimated against actual (PARTS, OIL, LABOUR, SERVICE_CHARGE and TOTAL, customer amounts before VAT), the warranty claim, the active invoice (total, advance paid, payments, balance due, jobs on it) or the draft before it (total, advance, balance, readiness reasons, proposed storage), other open jobs on the vehicle, the last cancelled bill, credit approval (who, role, when), the payment status, the reason the job cannot go to delivery yet, and what this person may do.'
 *     responses:
 *       200: { description: 'status=success, data=billing step' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 * /api/service/job-cards/{id}/billing/ready:
 *   post:
 *     tags: [Service]
 *     summary: Mark the vehicle ready and record that the customer was told
 *     description: 'Requires jobcard:update; service advisor only; job at Billing with status QC. Body { requestId, channel: PHONE_CALL | SMS, note? }. Runs MARK_READY through the stage service (passed quality check, campaign answers and the other existing gates; 409 STAGE_ACTION_BLOCKED with reasons) and records the first ready notice, which starts the storage counter. There is no SMS gateway: SMS records that the advisor sent one. A repeated requestId records once.'
 * /api/service/job-cards/{id}/billing/notices:
 *   post:
 *     tags: [Service]
 *     summary: Record that the customer was told again (Send again)
 *     description: 'Requires jobcard:update; service advisor, service manager or admin; job ready or invoiced at Billing or Delivery. Body { requestId, channel, note? }. The storage counter keeps the first notice.'
 * /api/service/job-cards/{id}/billing/washed:
 *   put:
 *     tags: [Service]
 *     summary: Tick or clear Vehicle washed
 *     description: 'Requires jobcard:update; service advisor, service manager or admin; job at Billing. Body { washed: boolean }. Audited.'
 */
export const jobBillingRoutes = Router({ mergeParams: true });
jobBillingRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

jobBillingRoutes.get("/", validateRequest(z.object({ params: jobParams })), handle((req) => service.view(req.params.id, actor(req))));
jobBillingRoutes.post(
  "/ready",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: readyNoticeBody })),
  handle((req) => service.markReady(req.params.id, actor(req), readyNoticeBody.parse(req.body)), "Vehicle marked ready"),
);
jobBillingRoutes.post(
  "/notices",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: readyNoticeBody })),
  handle((req) => service.notifyAgain(req.params.id, actor(req), readyNoticeBody.parse(req.body)), "Customer notice recorded"),
);
jobBillingRoutes.put(
  "/washed",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: washedBody })),
  handle((req) => service.setWashed(req.params.id, actor(req), washedBody.parse(req.body).washed), "Vehicle washed saved"),
);
