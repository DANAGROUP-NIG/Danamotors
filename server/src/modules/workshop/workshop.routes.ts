import { Router } from "express";
import { WorkshopController } from "./workshop.controller";
import { validateRequest } from "../../middleware/requestValidator";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import prisma from "../../prisma/client";
import { assertBranchOwnership } from "../../middleware/authorize";
import { WorkshopService } from "./workshop.service";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  assignTechnicianSchema,
  receivePartsSchema,
} from "./workshop.validation";
const router = Router();
const controller = new WorkshopController();

router.use(authMiddleware);

/**
 * @openapi
 * /workshop/technicians:
 *   get:
 *     tags:
 *       - Workshop
 *     summary: List all technicians
 *     description: Requires workshop:read. Returns paginated branch technicians with openJobs and closedJobs. Set activeOnly=true for assignment choices; the default directory includes inactive users.
 *     parameters:
 *       - { in: query, name: activeOnly, schema: { type: boolean, default: false } }
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Technician list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/UserDTO'
 *
 * /workshop/assign/{id}:
 *   post:
 *     tags:
 *       - Workshop
 *     summary: Assign technician to a job card
 *     description: Requires assignment:create and job branch access. The technician must be active and belong to the same branch. Closed or billed jobs cannot be reassigned. Records old/new assignment and actor in the audit log.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Job card ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [technicianId]
 *             properties:
 *               technicianId: { type: string }
 *     responses:
 *       200:
 *         description: Technician assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
/**
 * @openapi
 * /workshop/parts/{id}/receive:
 *   post:
 *     tags: [Workshop]
 *     summary: Sign for issued parts
 *     description: Requires jobprogress:update, branch access and the active assigned technician. A PNG signature is required for new requests. Stores immutable evidence with server timestamp; does not return the image. Repeated collection cannot replace existing evidence. Historical unsigned confirmations remain readable. After commit, the notification worker confirms collection to the signer and named service advisor when eligible.
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
 *             required: [confirmed, signatureImage]
 *             properties:
 *               confirmed: { type: boolean, enum: [true] }
 *               signatureImage: { type: string, maxLength: 88000, description: 'PNG data URL; decoded maximum 64 KiB, dimensions at most 2048 by 1024' }
 *           example: { confirmed: true, signatureImage: 'data:image/png;base64,...' }
 *     responses:
 *       200: { description: Recorded or previously recorded collection; no signature image }
 *       400: { description: 'Invalid PNG or closed/cancelled work. Validation errors contain field, message and code.' }
 *       401: { description: Authentication required }
 *       403: { description: Permission, branch or assigned-technician access denied }
 *       404: { description: Issuance or job not found }
 */
router.post(
  "/parts/:id/receive",
  requirePermission(PERMISSIONS.JOBPROGRESS_UPDATE),
  validateRequest(receivePartsSchema),
  async (req, res, next) => {
    try {
      const issue = await prisma.partIssuance.findUniqueOrThrow({
        where: { id: req.params.id },
      });
      assertBranchOwnership(req, issue.branchId);
      res.json({
        status: "success",
        data: await new WorkshopService().receiveParts(
          issue.id,
          req.user!.userId,
          req.body.signatureImage,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/technicians",
  requirePermission(PERMISSIONS.WORKSHOP_READ),
  controller.listTechnicians,
);
router.post(
  "/assign/:id",
  requirePermission(PERMISSIONS.ASSIGNMENT_CREATE),
  validateRequest(assignTechnicianSchema),
  controller.assignTechnician,
);

export default router;
