import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { validateRequest } from "../../middleware/requestValidator";
import { HandheldController } from "./handheld.controller";
import {
  cancelDocumentSchema,
  createDocumentSchema,
  idParamSchema,
  listDocumentsSchema,
  listPickersSchema,
  listSourcesSchema,
  uploadDocumentSchema,
} from "./handheld.validation";

const router = Router();
const controller = new HandheldController();

router.use(authMiddleware);

// Permissions depend on the document type, so the controller checks them per request:
// INDENT_PICK transfer:read / transfer:dispatch, CPO_PICK partsale:read / partsale:order,
// MIT_RECEIVE stock:read / stock:update.

/**
 * @openapi
 * tags:
 *   - name: Handheld
 *     description: |
 *       Picking lists, CPOs and Mobis MITs on the handheld (legacy HHDC Branch Indent, Customer Purchase Order and
 *       Material In Transit). HHDC Link sends a document to the device and uploads the result once.
 *
 *       - INDENT_PICK: each reservation drops to what was picked; the short goes back to the indent's back order.
 *       - CPO_PICK: each reservation drops to what was picked; the short goes back to free stock.
 *       - MIT_RECEIVE: the MIT becomes VERIFIED and its counts prefill Generate MRN; the store still posts the MRN.
 *
 *       A short pick needs a reason. Substitutes and parts not on an MIT are recorded for the store, never posted.
 *
 * /handheld/sources:
 *   get:
 *     tags: [Handheld]
 *     summary: Documents that can be sent to a handheld now
 *     parameters:
 *       - { in: query, name: type, required: true, schema: { type: string, enum: [INDENT_PICK, CPO_PICK, MIT_RECEIVE] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *     responses: { 200: { description: Open picking lists, picked CPOs or MITs in transit without a document on a device } }
 * /handheld/pickers:
 *   get:
 *     tags: [Handheld]
 *     summary: Current employees to choose as the picker or checker
 *     description: For anyone who may send a handheld document of any type. Own branch unless cross-branch.
 *     parameters: [{ in: query, name: branchId, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Employees (id, code, name) } }
 * /handheld/documents:
 *   get:
 *     tags: [Handheld]
 *     summary: List handheld documents
 *     parameters:
 *       - { in: query, name: type, schema: { type: string, enum: [INDENT_PICK, CPO_PICK, MIT_RECEIVE] } }
 *       - { in: query, name: status, schema: { type: string, enum: [SENT, UPLOADED, CANCELLED] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sourceId, schema: { type: string, format: uuid }, description: Picking list, CPO or MIT id }
 *       - { in: query, name: indentId, schema: { type: string, format: uuid }, description: Every picking list of an indent }
 *     responses: { 200: { description: Documents, newest first } }
 *   post:
 *     tags: [Handheld]
 *     summary: Send a picking list, CPO or MIT to a handheld
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { type: INDENT_PICK, sourceId: 0f1e2d3c-4b5a-4968-8776-655443322110, pickerId: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d }
 *     responses:
 *       201: { description: Document with its lines, in bin order (MIT in case order) }
 *       409: { description: Already on a handheld, or nothing left to pick or receive }
 * /handheld/documents/{id}:
 *   get:
 *     tags: [Handheld]
 *     summary: Get a handheld document with its lines and results
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Document } }
 * /handheld/documents/{id}/upload:
 *   post:
 *     tags: [Handheld]
 *     summary: Upload the handheld result (once)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             lines:
 *               - { lineId: 0f1e2d3c-4b5a-4968-8776-655443322110, quantity: 7, shortReason: LESS_IN_BIN }
 *               - { lineId: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d, quantity: 0, shortReason: OTHER, scannedPartNumber: 503103E102 }
 *             unreportedReason: NOT_FOUND
 *     responses:
 *       200: { description: Document with results and totals }
 *       400: { description: Picked above reserved, received above invoiced, or a short line without a reason }
 *       409: { description: Already uploaded, cancelled, or the source changed after it was sent }
 * /handheld/documents/{id}/cancel:
 *   patch:
 *     tags: [Handheld]
 *     summary: Cancel a document still on the handheld
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { remark: Picker sent to another job }
 *     responses: { 200: { description: Cancelled; reservations are untouched } }
 */
router.get("/sources", validateRequest(listSourcesSchema), controller.listSources);
router.get("/pickers", validateRequest(listPickersSchema), controller.listPickers);
router.get("/documents", validateRequest(listDocumentsSchema), controller.listDocuments);
router.post("/documents", validateRequest(createDocumentSchema), controller.createDocument);
router.get("/documents/:id", validateRequest(idParamSchema), controller.getDocument);
router.post("/documents/:id/upload", validateRequest(uploadDocumentSchema), controller.upload);
router.patch("/documents/:id/cancel", validateRequest(cancelDocumentSchema), controller.cancel);

export default router;
