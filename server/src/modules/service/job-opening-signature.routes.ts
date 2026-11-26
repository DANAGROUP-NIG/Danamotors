import { Router } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  requirePermission,
  assertBranchOwnership,
} from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { openingSignatureBody } from "./job-opening-signature.logic";
import {
  getSignedOpeningConsent,
  signJobOpening,
  printSignedJobOpening,
} from "./job-opening-signature.service";

export const jobOpeningSignatureRoutes = Router({ mergeParams: true });
jobOpeningSignatureRoutes.use(
  requirePermission(PERMISSIONS.JOBCARD_READ),
  async (req, _res, next) => {
    try {
      z.object({ id: z.string().uuid() }).parse(req.params);
      const job = await prisma.jobCard.findUnique({
        where: { id: req.params.id },
        select: { branchId: true },
      });
      if (!job) throw new NotFoundError("Job card not found");
      assertBranchOwnership(req, job.branchId);
      next();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @openapi
 * /service/job-cards/{id}/opening-consent:
 *   get:
 *     tags: [Service & Job Cards]
 *     summary: Review job-opening scope, terms and signature state
 *     description: Requires jobcard:read and branch access. Returns document, expectedHash, state and latest signature metadata without the image. States are legacy, required, signed, stale or invalid. Estimate approval remains separate. Terms and job content are hashed; no repair costs are authorized here.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Current opening document and image-free signature metadata }
 *       401: { description: Authentication required }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 *   post:
 *     tags: [Service & Job Cards]
 *     summary: Capture signed job-opening approval separately from estimate approval
 *     description: Requires jobcard:read, estimate:sign (existing customer signature capture permission) and branch access. Locks the job, verifies expectedHash, stores immutable scope/terms, signer, server timestamp and PNG evidence. A representative needs relationship/authority. Same-key identical retries return the original record; changed details return 409. New jobs require current evidence before work or QC/READY; historical jobs remain compatible until signed.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required: [accepted, expectedHash, idempotencyKey, signerName, signatureImage]
 *             properties:
 *               accepted: { type: boolean, enum: [true] }
 *               expectedHash: { type: string, pattern: '^[a-f0-9]{64}$' }
 *               idempotencyKey: { type: string, format: uuid }
 *               signerName: { type: string, minLength: 1, maxLength: 200 }
 *               relationship: { type: string, maxLength: 200 }
 *               signatureImage: { type: string, maxLength: 88000, description: 'PNG data URL, decoded limit 64 KiB and 2048 by 1024 pixels' }
 *           example: { accepted: true, expectedHash: '0000000000000000000000000000000000000000000000000000000000000000', idempotencyKey: '11111111-1111-4111-8111-111111111111', signerName: 'Customer name', signatureImage: 'data:image/png;base64,...' }
 *     responses:
 *       200: { description: Signed revision metadata, including original result on identical retry }
 *       400: { description: 'Invalid fields, PNG, representative authority or closed work. Validation errors contain field, message and code.' }
 *       401: { description: Authentication required }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 *       409: { description: Job/terms changed or retry key conflicts }
 * /service/job-cards/{id}/opening-consent/{signatureId}/print:
 *   get:
 *     tags: [Service & Job Cards]
 *     summary: Print a specific immutable signed job-opening revision
 *     description: Requires jobcard:read, estimate:print and branch access. Returns only the signed opening document, its signature image/metadata and whether its scope still matches the job. No estimate or workshop-only data is returned. Invalid evidence returns 409. Historical revisions remain addressable by ID.
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: signatureId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Signed scope, terms, image, signer and timestamp }
 *       401: { description: Authentication required }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job or signed revision not found }
 *       409: { description: Signature evidence integrity check failed }
 */
jobOpeningSignatureRoutes.get<{ id: string }>("/", async (req, res, next) => {
  try {
    res.json({
      status: "success",
      data: await getSignedOpeningConsent(req.params.id),
    });
  } catch (error) {
    next(error);
  }
});
jobOpeningSignatureRoutes.post<{ id: string }>(
  "/",
  requirePermission(PERMISSIONS.ESTIMATE_SIGN),
  validateRequest(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: openingSignatureBody,
    }),
  ),
  async (req, res, next) => {
    try {
      res.json({
        status: "success",
        data: await signJobOpening(req.params.id, req.body, req.user!.userId),
      });
    } catch (error) {
      next(error);
    }
  },
);
jobOpeningSignatureRoutes.get<{ id: string; signatureId: string }>(
  "/:signatureId/print",
  requirePermission(PERMISSIONS.ESTIMATE_PRINT),
  validateRequest(
    z.object({
      params: z.object({
        id: z.string().uuid(),
        signatureId: z.string().uuid(),
      }),
    }),
  ),
  async (req, res, next) => {
    try {
      res.json({
        status: "success",
        data: await printSignedJobOpening(
          req.params.id,
          req.params.signatureId,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
