import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import {
  approveBody,
  chargeBody,
  exemptionBody,
  notifyCashierBody,
  phoneApprovalBody,
  prepareBody,
  presentBody,
  saveDraftBody,
  waiverDecisionBody,
  waiverRequestBody,
} from "./job-estimate.logic";
import { JobEstimateService, type EstimateActor } from "./job-estimate.service";
import { supplementaryBody } from "./job-repair.logic";

const service = new JobEstimateService();
const actor = (req: Request): EstimateActor => ({ id: req.user!.userId, role: req.user!.role, permissions: req.user!.permissions });
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });
const route = <T extends z.ZodTypeAny>(body: T) => validateRequest(z.object({ params: jobParams, body }));

/** Every estimate route: the job must exist and be in a branch this person can work in. */
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
 * /api/service/job-cards/{id}/estimate:
 *   get:
 *     tags: [Service]
 *     summary: The staged estimate step (job card revamp phase 5)
 *     description: 'Requires jobcard:read, estimate:read and branch access. The latest revision with lines grouped by payer (CUSTOMER, WARRANTY, GOODWILL, CAMPAIGN), money as 2-decimal strings, totals (customer subtotal, VAT, customer total, other-payer total, approved totals), the version 2 content hash to sign, the customer decision (COUNTER with signature, or PHONE with who, phone and when and signatureDueAtDelivery), the estimation charge (terms clause 4) when everything was declined, the advance (required or exempt with the reason, suggested amount, received, balance, receipts and the branch cashiers), the parts request and what this person may do (access).'
 *     responses:
 *       200: { description: 'status=success, data=estimate step' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 * /api/service/job-cards/{id}/estimate/supplementary:
 *   post:
 *     tags: [Service]
 *     summary: Prepare a supplementary estimate during repair (job card revamp phase 6)
 *     description: 'Requires jobcard:update, estimate:create, an advisor role and branch access; the job must be in repair with a decided estimate and new findings raised during repair. Creates revision N+1 through the existing revision logic: earlier lines copied unchanged with their decisions (carriedOver), the new findings priced as customer pay. Repeating it returns the open supplementary revision. Body: { requestId }.'
 *     responses:
 *       200: { description: 'status=success, data=estimate step' }
 *       403: { description: Not the service advisor, or the job is not in repair }
 *       409: { description: No decided estimate, or no new finding to price }
 * /api/service/job-cards/{id}/estimate/prepare:
 *   post:
 *     tags: [Service]
 *     summary: Prepare revision 1 from the diagnosis
 *     description: 'Requires jobcard:update and estimate:create; the service advisor while the job is at the estimate step. One line per diagnosed item (merged by part or labour operation) plus the service charge line, priced from the catalogue and the model labour rates; who pays comes from the warranty check. Repeating it returns the existing estimate. Audited as ESTIMATE_CREATED.'
 * /api/service/job-cards/{id}/estimate/draft:
 *   put:
 *     tags: [Service]
 *     summary: Save the undecided draft in place (lines, quantities, suggested advance)
 *     description: 'Body: estimateId, updatedAt (as loaded; 409 when someone saved since), upfrontPaymentPercent, lines (type, referenceId, quantity, payer, findingItemId, complaintId). Prices are set on the server. Lines from diagnosed items keep the warranty check payer; added lines are customer pay. Clears presentedAt. Audited as ESTIMATE_DRAFT_SAVED.'
 * /api/service/job-cards/{id}/estimate/present:
 *   post:
 *     tags: [Service]
 *     summary: Present the draft to the customer (opens customer approval)
 * /api/service/job-cards/{id}/estimate/approval:
 *   post:
 *     tags: [Service]
 *     summary: Customer approves or declines each customer-pay line and signs
 *     description: 'Requires estimate:sign. Body: estimateId, expectedHash (the hash shown), decisions (one per customer-pay line), signer OWNER or REPRESENTATIVE, signerName, signerPhone (required for a representative), signatureImage (PNG data URL), consentAccepted, requestId (a retry returns the first decision). Stores the line decisions, an EstimateSignature with the approved total and a version 2 hash covering the decisions, then requests the approved parts from the store once (a failure is recorded for retry; stock is not touched). Audited as ESTIMATE_DECISION_RECORDED.'
 * /api/service/job-cards/{id}/estimate/phone-approval:
 *   post:
 *     tags: [Service]
 *     summary: Record an approval given on the phone; the customer signs at delivery
 *     description: 'Body: estimateId, expectedHash, approverName, approverPhone (Nigerian mobile), approvedAt (not in the future), approvedLineIds (customer-pay lines approved; the rest are declined), note, requestId. Saved with channel PHONE, no signature image and signatureDueAtDelivery. Audited as ESTIMATE_PHONE_APPROVAL_RECORDED.'
 * /api/service/job-cards/{id}/estimate/parts-request:
 *   post:
 *     tags: [Service]
 *     summary: Retry the automatic parts request after a failure (idempotent per revision)
 * /api/service/job-cards/{id}/estimate/estimation-charge:
 *   post:
 *     tags: [Service]
 *     summary: Add the estimation charge (terms clause 4) when the customer declined all work
 *     description: 'The larger of the branch minimum (default 25,000.00) and the branch percentage (default 10) of the estimate customer total. Billed through the job bill. Audited as ESTIMATION_CHARGE_ADDED.'
 * /api/service/job-cards/{id}/estimate/estimation-charge/waiver:
 *   post:
 *     tags: [Service]
 *     summary: Ask a manager to waive the estimation charge (reason required; managers notified)
 *   put:
 *     tags: [Service]
 *     summary: Approve or decline the waiver (service manager or workshop manager; note required to decline)
 * /api/service/job-cards/{id}/estimate/advance-exemption:
 *   put:
 *     tags: [Service]
 *     summary: Record or clear why no advance is needed (FREE_SERVICE, INTERNAL, CREDIT_APPROVED) with a reason
 * /api/service/job-cards/{id}/estimate/notify-cashier:
 *   post:
 *     tags: [Service]
 *     summary: In-app notice to everyone in the branch who can record a receipt
 */
export const jobEstimateRoutes = Router({ mergeParams: true });
jobEstimateRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), requirePermission(PERMISSIONS.ESTIMATE_READ), jobBranchAccess);
const update = requirePermission(PERMISSIONS.JOBCARD_UPDATE);

jobEstimateRoutes.get("/", validateRequest(z.object({ params: jobParams })), handle((req) => service.view(req.params.id, actor(req))));
jobEstimateRoutes.post("/prepare", update, route(prepareBody), handle((req) => service.prepare(req.params.id, actor(req)), "Estimate prepared"));
jobEstimateRoutes.put("/draft", update, route(saveDraftBody), handle((req) => service.saveDraft(req.params.id, actor(req), req.body), "Estimate saved"));
jobEstimateRoutes.post(
  "/present",
  update,
  route(presentBody),
  handle((req) => service.presentToCustomer(req.params.id, actor(req), req.body.estimateId), "Estimate presented"),
);
jobEstimateRoutes.post(
  "/approval",
  update,
  requirePermission(PERMISSIONS.ESTIMATE_SIGN),
  route(approveBody),
  handle((req) => service.approve(req.params.id, actor(req), req.body, `${req.ip ?? "unknown"} ${req.get("user-agent") ?? ""}`.slice(0, 500)), "Approval saved"),
);
jobEstimateRoutes.post(
  "/phone-approval",
  update,
  requirePermission(PERMISSIONS.ESTIMATE_SIGN),
  route(phoneApprovalBody),
  handle((req) => service.phoneApproval(req.params.id, actor(req), req.body), "Phone approval saved"),
);
jobEstimateRoutes.post(
  "/supplementary",
  update,
  route(supplementaryBody),
  handle((req) => service.prepareSupplementary(req.params.id, actor(req)), "Supplementary estimate prepared"),
);
jobEstimateRoutes.post("/parts-request", update, route(chargeBody), handle((req) => service.retryPartsRequest(req.params.id, actor(req)), "Parts request sent"));
jobEstimateRoutes.post(
  "/estimation-charge",
  update,
  route(chargeBody),
  handle((req) => service.addEstimationCharge(req.params.id, actor(req)), "Estimation charge added"),
);
jobEstimateRoutes.post(
  "/estimation-charge/waiver",
  update,
  route(waiverRequestBody),
  handle((req) => service.requestWaiver(req.params.id, actor(req), req.body), "Waiver requested"),
);
// Manager approvals: the service checks the role (service manager, workshop manager or admin).
jobEstimateRoutes.put(
  "/estimation-charge/waiver",
  route(waiverDecisionBody),
  handle((req) => service.decideWaiver(req.params.id, actor(req), req.body), "Waiver decided"),
);
jobEstimateRoutes.put(
  "/advance-exemption",
  route(exemptionBody),
  handle((req) => service.setExemption(req.params.id, actor(req), req.body), "Advance exemption saved"),
);
jobEstimateRoutes.post(
  "/notify-cashier",
  update,
  route(notifyCashierBody),
  handle((req) => service.notifyCashier(req.params.id, actor(req), req.body), "Cashier notified"),
);
