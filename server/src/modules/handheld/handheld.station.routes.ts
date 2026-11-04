import { Router } from "express";
import { validateRequest } from "../../middleware/requestValidator";
import { HandheldStationController } from "./handheld.controller";
import { claimSchema, clearedSchema, confirmSchema, heartbeatSchema, releaseSchema, resultSchema } from "./handheld.validation";
import { claimPrintsSchema, printDoneSchema } from "../labels/labels.validation";

/**
 * Station endpoints (HHDC Link in station mode on a store PC). Authenticated by the station's own key,
 * never a user session; a station acts only for its own branch.
 */
const router = Router();
const controller = new HandheldStationController();

router.use(controller.authenticate);

/**
 * @openapi
 * tags:
 *   - name: Handheld Station
 *     description: |
 *       Called by HHDC Link in station mode with `Authorization: Station <stationId>.<secret>` (issued on the web by
 *       handheld:stations). A station is online while it sends a heartbeat at least every 2 minutes.
 *
 *       1. Heartbeat: the docked handheld (its id from device.txt; a new one is registered and named) and the job files
 *          on it. The reply says how many jobs wait and, per file, COLLECT, REMOVE or KEEP.
 *       2. Claim: takes the branch's waiting jobs for the docked handheld under a 5-minute lease (never two stations).
 *       3. Write each to the device, read it back, then confirm (SENT); if the write failed, release it.
 *       4. Results: a finished file. Stored (RECEIVED), not applied. The same result again changes nothing; a different
 *          one for a received job is refused (409). `clear: true` means the device file may be deleted.
 *       5. Cleared: what was removed from the device after a cancel, or kept because it had entries.
 *
 *       Label printer (Zebra on the PC's USB): the heartbeat carries `printer` (null = none attached); while it is
 *       READY the station claims the branch's waiting label jobs every few seconds, prints the ZPL as it comes, and
 *       reports each one done (PRINTED) or failed.
 *
 * /handheld/station/heartbeat:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Station heartbeat with the docked handheld and its job files
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             linkVersion: "2026.10.28"
 *             docked:
 *               deviceId: 6b1c7c2e-8a35-4f1e-9d5e-3f2a1b0c9d8e
 *               appVersion: "1.4"
 *               appStatus: OK
 *               files: [{ kind: DOC, id: 0f1e2d3c-4b5a-4968-8776-655443322110, started: true, finished: true }]
 *     responses: { 200: { description: "{ device: { id, name }, deliver, files: [{ kind, id, action, reason }] }" }, 401: { description: Unknown or revoked key } }
 * /handheld/station/deliveries/claim:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Take the branch's waiting jobs for the docked handheld
 *     requestBody: { content: { application/json: { example: { deviceId: 6b1c7c2e-8a35-4f1e-9d5e-3f2a1b0c9d8e } } } }
 *     responses: { 200: { description: "{ jobs: [{ id, type, documentNumber, document | sheet }] }" } }
 * /handheld/station/deliveries/{id}/confirm:
 *   post:
 *     tags: [Handheld Station]
 *     summary: The job is on the handheld (read back and checked)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { deviceId: 6b1c7c2e-8a35-4f1e-9d5e-3f2a1b0c9d8e } } } }
 *     responses: { 200: { description: "{ status }: SENT, or CANCELLED if it was cancelled meanwhile (remove the file)" } }
 * /handheld/station/deliveries/{id}/release:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Writing failed; the job goes back to the queue
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { reason: "Document 2026000007 is already on the device with results" } } } }
 *     responses: { 200: { description: Released } }
 * /handheld/station/results:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Submit a finished result from the handheld
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             kind: DOC
 *             deviceId: 6b1c7c2e-8a35-4f1e-9d5e-3f2a1b0c9d8e
 *             id: 0f1e2d3c-4b5a-4968-8776-655443322110
 *             result: { lines: [{ lineId: 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d, quantity: 7, shortReason: LESS_IN_BIN }] }
 *     responses:
 *       200: { description: "{ status, clear, jobId, message }" }
 *       409: { description: A different result was already received for this job }
 * /handheld/station/devices/{deviceId}/cleared:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Cancelled jobs removed from the handheld, or kept because they had entries
 *     parameters: [{ in: path, name: deviceId, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { removed: [0f1e2d3c-4b5a-4968-8776-655443322110], kept: [] } } } }
 *     responses: { 200: { description: Recorded } }
 * /handheld/station/prints/claim:
 *   post:
 *     tags: [Handheld Station]
 *     summary: Take the branch's waiting label jobs (only while the printer is READY; 2-minute lease)
 *     requestBody: { content: { application/json: { example: { printer: { model: "ZTC S4M-200dpi ZPL", status: READY } } } } }
 *     responses: { 200: { description: "{ jobs: [{ id, labelCount, zpl }] }" } }
 * /handheld/station/prints/{id}/done:
 *   post:
 *     tags: [Handheld Station]
 *     summary: The labels went to the printer (ok), or could not (error)
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string, format: uuid } }]
 *     requestBody: { content: { application/json: { example: { ok: false, error: "Printer paper out" } } } }
 *     responses: { 200: { description: "{ status }: PRINTED or FAILED" }, 409: { description: Claimed by another station } }
 */
router.post("/heartbeat", validateRequest(heartbeatSchema), controller.heartbeat);
router.post("/deliveries/claim", validateRequest(claimSchema), controller.claim);
router.post("/deliveries/:id/confirm", validateRequest(confirmSchema), controller.confirm);
router.post("/deliveries/:id/release", validateRequest(releaseSchema), controller.release);
router.post("/results", validateRequest(resultSchema), controller.result);
router.post("/devices/:deviceId/cleared", validateRequest(clearedSchema), controller.cleared);
router.post("/prints/claim", validateRequest(claimPrintsSchema), controller.claimPrints);
router.post("/prints/:id/done", validateRequest(printDoneSchema), controller.printDone);

export default router;
