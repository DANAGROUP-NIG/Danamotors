import { Router } from 'express';
import { WorkshopController } from './workshop.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import {
  assignTechnicianSchema,
  updateJobProgressSchema,
  qcUpdateSchema,
} from './workshop.validation';
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
 *     description: Returns a list of all users with a TECHNICIAN role in the branch.
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
 *
 * /workshop/progress/{id}:
 *   patch:
 *     tags:
 *       - Workshop
 *     summary: Update job progress
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [IN_PROGRESS, COMPLETED, ON_HOLD] }
 *               progressNotes: { type: string }
 *               percentComplete: { type: integer, minimum: 0, maximum: 100 }
 *     responses:
 *       200:
 *         description: Progress updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *
 * /workshop/qc/{id}:
 *   patch:
 *     tags:
 *       - Workshop
 *     summary: Update quality control (QC) status
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
 *             required: [qcStatus]
 *             properties:
 *               qcStatus: { type: string, enum: [PASSED, FAILED, PENDING] }
 *               qcNotes: { type: string }
 *     responses:
 *       200:
 *         description: QC status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */
router.get('/technicians', requirePermission(PERMISSIONS.WORKSHOP_READ), controller.listTechnicians);
router.post('/assign/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(assignTechnicianSchema), controller.assignTechnician);
router.patch('/progress/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(updateJobProgressSchema), controller.updateProgress);
router.patch('/qc/:id', requirePermission(PERMISSIONS.WORKSHOP_UPDATE), validateRequest(qcUpdateSchema), controller.updateQC);

export default router;

