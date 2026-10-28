import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requirePermission } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/constants/roles";
import { validateRequest } from "../../middleware/requestValidator";
import { HandheldController } from "./handheld.controller";
import {
  branchQuerySchema,
  cancelDocumentSchema,
  createDocumentSchema,
  createStationSchema,
  idParamSchema,
  listDocumentsSchema,
  listPickersSchema,
  listSourcesSchema,
  postDocumentSchema,
  renameDeviceSchema,
  uploadDocumentSchema,
} from "./handheld.validation";

const router = Router();
const controller = new HandheldController();

router.use(authMiddleware);

// Permissions depend on the document type, so the controller checks them per request:
// INDENT_PICK transfer:read / transfer:dispatch, CPO_PICK partsale:read / partsale:order,
// MIT_RECEIVE stock:read / stock:update, COUNT_SHEET stocktake:read / stocktake:manage (an audit's sheet
// stockaudit:*). Station keys: handheld:stations.
const manageStations = requirePermission(PERMISSIONS.HANDHELD_STATIONS);

/**
 * @openapi
 * tags:
 *   - name: Handheld
 *     description: |
 *       Picking lists, CPOs, Mobis MITs and count sheets on the handheld (legacy HHDC Branch Indent, Customer
 *       Purchase Order, Material In Transit and physical stock). The store sends a job from the document's page; it
 *       waits (QUEUED) until a handheld docks at a station PC of the branch, which writes it to the device (SENT).
 *       When the picker finishes, the station collects the result (RECEIVED) and the store posts it on the page
 *       (UPLOADED), once only. Station endpoints: tag Handheld Station.
 *
 *       - INDENT_PICK: each reservation drops to what was picked; the short goes back to the indent's back order.
 *       - CPO_PICK: each reservation drops to what was picked; the short goes back to free stock.
 *       - MIT_RECEIVE: the MIT becomes VERIFIED and its counts prefill Generate MRN; the store still posts the MRN.
 *       - COUNT_SHEET: the counts are uploaded to the stock taking; uncounted parts are ZERO or RELEASE.
 *
 *       A short pick needs a reason. Substitutes and parts not on an MIT are recorded for the store, never posted.
 *
 * /handheld/sources:
 *   get:
 *     tags: [Handheld]
 *     summary: Documents that can be sent to a handheld now
 *     parameters:
 *       - { in: query, name: type, required: true, schema: { type: string, enum: [INDENT_PICK, CPO_PICK, MIT_RECEIVE, COUNT_SHEET] } }
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
 *       - { in: query, name: type, schema: { type: string, enum: [INDENT_PICK, CPO_PICK, MIT_RECEIVE, COUNT_SHEET] } }
 *       - { in: query, name: status, schema: { type: string, enum: [QUEUED, SENT, RECEIVED, UPLOADED, CANCELLED] } }
 *       - { in: query, name: branchId, schema: { type: string, format: uuid } }
 *       - { in: query, name: sourceId, schema: { type: string, format: uuid }, description: Picking list, CPO or MIT id }
 *       - { in: query, name: indentId, schema: { type: string, format: uuid }, description: Every picking list of an indent }
 *       - { in: query, name: stockTakeId, schema: { type: string, format: uuid }, description: Every count sheet job of a stock taking }
 *     responses: { 200: { description: Documents, newest first } }
 *   post:
 *     tags: [Handheld]
 *     summary: Send a picking list, CPO, MIT or count sheet to the next handheld docked at the branch
 *     description: |
 *       Queues the job (QUEUED). Documents take the picker (employee); a count sheet takes its checker (user)
 *       if it changes. `manual: true` is for HHDC Link signed in by IT: the job is SENT at once and Link writes it.
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { type: INDENT_PICK, sourceId: 0f1e2d3c-4b5a-4968-8776-655443322110, pickerId: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d }
 *     responses:
 *       201: { description: Job with its lines, in bin order (MIT in case order) }
 *       409: { description: Already waiting, on a handheld or waiting to be posted, or nothing left to pick or receive }
 * /handheld/documents/{id}:
 *   get:
 *     tags: [Handheld]
 *     summary: Get a handheld document with its lines and results
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Document } }
 * /handheld/documents/{id}/post:
 *   post:
 *     tags: [Handheld]
 *     summary: Post a result the station collected (once)
 *     description: |
 *       Applies the stored result exactly as an upload does. Picking: `unreportedReason` for lines the picker never
 *       saved (default NOT_FOUND). Count sheet: `uncounted` ZERO or RELEASE is required.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { unreportedReason: NOT_FOUND }
 *     responses:
 *       200: { description: Job (UPLOADED) and totals }
 *       409: { description: Not received yet, already posted, cancelled, or the source changed after it was sent }
 * /handheld/documents/{id}/upload:
 *   post:
 *     tags: [Handheld]
 *     summary: Upload and post a device result in one step (HHDC Link, IT tool)
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
 *     summary: Cancel a job that is not posted yet
 *     description: |
 *       While waiting, on a handheld, or received. The station removes it from the device at the next dock if it was
 *       never started; a received result is kept on the job and never applied.
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { remark: Picker sent to another job }
 *     responses: { 200: { description: Cancelled; reservations are untouched } }
 * /handheld/stations/status:
 *   get:
 *     tags: [Handheld]
 *     summary: Station state of a branch (for the Send dialog)
 *     description: Stations online (heartbeat in the last 2 minutes) and the handheld docked at each.
 *     parameters: [{ in: query, name: branchId, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ branch, stations, online, docked }" } }
 * /handheld/stations:
 *   get:
 *     tags: [Handheld]
 *     summary: Stations, handhelds and active jobs (Settings > HHDC)
 *     parameters: [{ in: query, name: branchId, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: "{ stations, devices, jobs, canManage }; keys are never returned" } }
 *   post:
 *     tags: [Handheld]
 *     summary: Register a store PC as a handheld station (handheld:stations)
 *     requestBody:
 *       content:
 *         application/json:
 *           example: { branchId: 0f1e2d3c-4b5a-4968-8776-655443322110, name: STORE-PC1 }
 *     responses: { 201: { description: "Station and its key, shown only once (stationId.secret)" } }
 * /handheld/stations/{id}/rotate-key:
 *   post:
 *     tags: [Handheld]
 *     summary: Issue a new key for a station (the old one stops working)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Station and its new key } }
 * /handheld/stations/{id}/revoke:
 *   patch:
 *     tags: [Handheld]
 *     summary: Revoke a station
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     responses: { 200: { description: Station (revoked) } }
 * /handheld/devices/{id}:
 *   patch:
 *     tags: [Handheld]
 *     summary: Rename a handheld (as labelled on the device)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { name: MC3190-1 } } } }
 *     responses: { 200: { description: Handheld } }
 */
router.get("/sources", validateRequest(listSourcesSchema), controller.listSources);
router.get("/pickers", validateRequest(listPickersSchema), controller.listPickers);
router.get("/documents", validateRequest(listDocumentsSchema), controller.listDocuments);
router.post("/documents", validateRequest(createDocumentSchema), controller.createDocument);
router.get("/documents/:id", validateRequest(idParamSchema), controller.getDocument);
router.post("/documents/:id/post", validateRequest(postDocumentSchema), controller.post);
router.post("/documents/:id/upload", validateRequest(uploadDocumentSchema), controller.upload);
router.patch("/documents/:id/cancel", validateRequest(cancelDocumentSchema), controller.cancel);
router.get("/stations/status", validateRequest(branchQuerySchema), controller.stationState);
router.get("/stations", validateRequest(branchQuerySchema), controller.overview);
router.post("/stations", manageStations, validateRequest(createStationSchema), controller.createStation);
router.post("/stations/:id/rotate-key", manageStations, validateRequest(idParamSchema), controller.rotateKey);
router.patch("/stations/:id/revoke", manageStations, validateRequest(idParamSchema), controller.revokeStation);
router.patch("/devices/:id", manageStations, validateRequest(renameDeviceSchema), controller.renameDevice);

export default router;
