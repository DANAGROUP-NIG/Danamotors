import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { deliveryBody, phoneSignatureBody, releaseApprovalBody, releaseRequestBody } from "./job-delivery.logic";
import { JobDeliveryService } from "./job-delivery.service";
import type { RepairActor } from "./job-repair.service";

const service = new JobDeliveryService();
const actor = (req: Request): RepairActor => ({ id: req.user!.userId, role: req.user!.role, permissions: req.user!.permissions, branchId: req.user!.branchId ?? null });
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });
const deviceOrIp = (req: Request) => `${req.ip ?? "unknown"} ${req.get("user-agent") ?? ""}`.trim().slice(0, 300);

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
 * /api/service/job-cards/{id}/delivery:
 *   get:
 *     tags: [Service]
 *     summary: The Delivery step (job card revamp phase 9)
 *     description: 'Requires jobcard:read and branch access. Work done in plain words (approved work lines, noting work added with the customer''s approval and work not charged), the items the customer declined on this visit, the belongings to return (returnable check-in items that were Present, then the belongings note), the owner and the person who signed at check-in when that was not the owner, the latest manager approval to release the vehicle to someone else, estimate revisions approved on the phone and still to be signed, the payment problem, whether the job is late, and, once delivered, who collected it, when, the gate pass number, the follow-up call date and the late reasons. access says what this person may do.'
 *   post:
 *     tags: [Service]
 *     summary: Complete delivery and issue the gate pass
 *     description: 'Requires jobcard:update and estimate:sign; service advisor, service manager or admin; job at Delivery. Body { requestId, collectorType: OWNER | CHECK_IN_SIGNER | OTHER, returnedCodes, lateReasonIds, lateRemarks?, accepted: true, signatureImage (PNG data URL) }. Under the job lock: checks payment, phone approvals signed, every belonging returned, the collector (OTHER needs a manager''s approval, terms clause 7), 1 to 6 distinct active late reasons after the promised time; stores the JobDeliverySignature (document and evidence hashes, never updated), then runs DELIVER through the stage service (existing delivery path: delivery advisor, server time, gate pass, status DELIVERED, step Closed, follow-up call date). 409 DELIVERY_BLOCKED with reasons; 403 DELIVERY_FORBIDDEN. A repeated requestId returns the delivery without acting again.'
 * /api/service/job-cards/{id}/delivery/estimate-signature:
 *   post:
 *     tags: [Service]
 *     summary: The customer signs the estimate they approved on the phone
 *     description: 'Requires jobcard:update and estimate:sign; job at Delivery. Body { requestId, signerName, accepted: true, signatureImage }. Signs every estimate revision approved on the phone and not yet signed (EstimateSignature, channel DELIVERY, version 2 hash) and clears signatureDueAtDelivery. Audited ESTIMATE_PHONE_APPROVAL_SIGNED.'
 * /api/service/job-cards/{id}/delivery/release-approval:
 *   post:
 *     tags: [Service]
 *     summary: A manager approves releasing the vehicle to someone else
 *     description: 'Requires jobcard:read and the service manager, workshop manager or admin role; job at Delivery. Body { requestId, collectorName, collectorPhone (Nigerian mobile), reason (10 to 1,000 characters) }. Audited JOB_RELEASE_APPROVED.'
 * /api/service/job-cards/{id}/delivery/release-request:
 *   post:
 *     tags: [Service]
 *     summary: Ask the branch managers to approve the release
 *     description: 'Requires jobcard:update; service advisor, service manager or admin; job at Delivery. Body { requestId, collectorName }. In-app notice RELEASE_APPROVAL_REQUESTED to the branch service and workshop managers. Returns who was told.'
 */
export const jobDeliveryRoutes = Router({ mergeParams: true });
jobDeliveryRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

jobDeliveryRoutes.get("/", validateRequest(z.object({ params: jobParams })), handle((req) => service.view(req.params.id, actor(req))));
jobDeliveryRoutes.post(
  "/",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: deliveryBody })),
  handle((req) => service.deliver(req.params.id, actor(req), deliveryBody.parse(req.body)), "Vehicle delivered"),
);
jobDeliveryRoutes.post(
  "/estimate-signature",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: phoneSignatureBody })),
  handle((req) => service.signPhoneApprovals(req.params.id, actor(req), phoneSignatureBody.parse(req.body), deviceOrIp(req)), "Estimate signed"),
);
// A manager's decision (like credit approval): job read access and the manager role, checked by the service.
jobDeliveryRoutes.post(
  "/release-approval",
  validateRequest(z.object({ params: jobParams, body: releaseApprovalBody })),
  handle((req) => service.approveRelease(req.params.id, actor(req), releaseApprovalBody.parse(req.body)), "Release approved"),
);
jobDeliveryRoutes.post(
  "/release-request",
  requirePermission(PERMISSIONS.JOBCARD_UPDATE),
  validateRequest(z.object({ params: jobParams, body: releaseRequestBody })),
  handle((req) => service.requestRelease(req.params.id, actor(req), releaseRequestBody.parse(req.body)), "Managers notified"),
);
