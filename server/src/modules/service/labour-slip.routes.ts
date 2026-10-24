import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { LabourSlipController } from './labour-slip.controller';
import { addLabourSlipLineSchema, createLabourSlipSchema, labourSlipIdSchema, listLabourSlipsSchema, updateLabourSlipLineSchema } from './labour-slip.validation';

const router = Router();
const controller = new LabourSlipController();
router.use(authMiddleware);
/**
 * @swagger
 * /service/labour-slips:
 *   get:
 *     tags: [Service]
 *     summary: List branch-scoped labour slips
 *     description: Requires jobcard:read. Filters branchId and jobCardId; page defaults to 1 and limit to 25 (maximum 100). Other branches require branch:all.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Labour slips }
 *   post:
 *     tags: [Service]
 *     summary: Create a numbered labour slip with model-priced charge lines
 *     description: Requires jobcard:labour:update. Choose exactly one technician login or employee mechanic per line. Rate, pricing mode and standard hours are snapshots; chargedHours defaults to standard hours. FIXED pricing keeps its amount regardless of charged hours. Goodwill requires warranty:update and a reason; FREE requires a linked campaign. Existing approved-estimate rules apply. Writes on ready jobs reopen them for QC. Dates use Africa/Lagos.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *           example:
 *             branchId: 11111111-1111-4111-8111-111111111111
 *             jobCardId: 22222222-2222-4222-8222-222222222222
 *             lines:
 *               - labourItemId: 33333333-3333-4333-8333-333333333333
 *                 technicianId: 44444444-4444-4444-8444-444444444444
 *                 chargedHours: 2.5
 *                 chargeType: CUSTOMER
 *     responses:
 *       201: { description: Labour slip, standard/charged hours and totals by charge type }
 *       400: { description: Invalid assignment, charge or job status }
 *       403: { description: Permission or branch access denied }
 * /service/labour-slips/{id}:
 *   get:
 *     tags: [Service]
 *     summary: Read labour slip details
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Slip with job readiness, QC status and workDone }
 * /service/labour-slips/{id}/print:
 *   get:
 *     tags: [Service]
 *     summary: Read labour-slip print data without changing amounts
 *     description: Requires jobcard:read. Footer totals separate customer, warranty, free and goodwill. Vehicle ready and workDone use the existing job-card update API (jobcard:update); READY still requires a passed QC and a valid transition.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses:
 *       200: { description: Internal print data }
 * /service/labour-slips/{id}/lines:
 *   post:
 *     tags: [Service]
 *     summary: Add a labour line to an open job's slip
 *     description: Requires jobcard:labour:update. Same line input and validation as creation.
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
 *     responses:
 *       201: { description: Updated slip }
 * /service/labour-slips/{id}/lines/{lineId}:
 *   put:
 *     tags: [Service]
 *     summary: Save replacement values for a slip's labour line
 *     description: Requires jobcard:labour:update. Submit labourItemId, chargeType and one technician/mechanic plus optional chargedHours/group/campaign/reason. Same operation keeps its rate, standard hours and pricing snapshot. An operation change uses the new model rate. Audits the old values; billed/delivered/cancelled jobs or claim/bill references reject changes.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: lineId, required: true, schema: { type: string, format: uuid } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object } } } }
 *     responses:
 *       200: { description: Updated slip }
 */
router.get('/labour-slips', requirePermission(PERMISSIONS.JOBCARD_READ), validateRequest(listLabourSlipsSchema), controller.list);
router.post('/labour-slips', requirePermission(PERMISSIONS.JOBLABOUR_UPDATE), validateRequest(createLabourSlipSchema), controller.create);
router.get('/labour-slips/:id', requirePermission(PERMISSIONS.JOBCARD_READ), validateRequest(labourSlipIdSchema), controller.get);
router.get('/labour-slips/:id/print', requirePermission(PERMISSIONS.JOBCARD_READ), validateRequest(labourSlipIdSchema), controller.get);
router.post('/labour-slips/:id/lines', requirePermission(PERMISSIONS.JOBLABOUR_UPDATE), validateRequest(addLabourSlipLineSchema), controller.addLine);
router.put('/labour-slips/:id/lines/:lineId', requirePermission(PERMISSIONS.JOBLABOUR_UPDATE), validateRequest(updateLabourSlipLineSchema), controller.updateLine);
export default router;
