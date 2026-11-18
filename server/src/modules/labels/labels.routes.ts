import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { LabelController } from "./labels.controller";
import { branchQuerySchema, createJobSchema, idParamSchema, searchPartsSchema } from "./labels.validation";

const router = Router();
const controller = new LabelController();

router.use(authMiddleware, requirePermission(PERMISSIONS.LABELS_PRINT));

/**
 * @openapi
 * tags:
 *   - name: Barcode Labels
 *     description: |
 *       Part barcode labels (legacy Barcode Printing), 2" x 2", printed on the label printer of a handheld station PC
 *       of the branch (HHDC Link in station mode, Zebra on USB). A job waits (QUEUED) until a station with a ready
 *       printer takes it, then becomes PRINTED or FAILED. All endpoints need labels:print; a user without
 *       inventory:cross-branch works on their own branch.
 *
 * /labels/parts:
 *   get:
 *     tags: [Barcode Labels]
 *     summary: Search active parts, with bin and stock at the branch
 *     parameters:
 *       - { in: query, name: search, required: true, schema: { type: string, minLength: 2 } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: "{ parts: [{ id, partNumber, name, bin, stock }] }" } }
 * /labels/printers:
 *   get:
 *     tags: [Barcode Labels]
 *     summary: The branch's stations and their label printers
 *     parameters: [{ in: query, name: branchId, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ printers: [{ id, name, online, printerModel, printerStatus, printerDetail }] }" } }
 * /labels/jobs:
 *   get:
 *     tags: [Barcode Labels]
 *     summary: The branch's last 30 label print jobs
 *     parameters: [{ in: query, name: branchId, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ jobs }" } }
 *   post:
 *     tags: [Barcode Labels]
 *     summary: Print labels for parts (copies per part, 1-100)
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { labels: [{ partId: 3f2a1b0c-9d8e-4f1e-9d5e-6b1c7c2e8a35, copies: 2 }] }
 *     responses: { 201: { description: "{ job, printers }" } }
 * /labels/jobs/{id}/retry:
 *   post:
 *     tags: [Barcode Labels]
 *     summary: Print a failed or cancelled job again
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ job }" }, 409: { description: Not failed or cancelled } }
 * /labels/jobs/{id}/cancel:
 *   post:
 *     tags: [Barcode Labels]
 *     summary: Cancel a job no station has taken yet
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ job }" }, 409: { description: Already printing or finished } }
 */
router.get("/parts", validateRequest(searchPartsSchema), controller.searchParts);
router.get("/printers", validateRequest(branchQuerySchema), controller.printers);
router.get("/jobs", validateRequest(branchQuerySchema), controller.list);
router.post("/jobs", validateRequest(createJobSchema), controller.create);
router.post("/jobs/:id/retry", validateRequest(idParamSchema), controller.retry);
router.post("/jobs/:id/cancel", validateRequest(idParamSchema), controller.cancel);

export default router;
