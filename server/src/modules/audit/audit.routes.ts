import { Router } from 'express';
import { AuditController } from './audit.controller';
import { validateRequest } from '../../middleware/requestValidator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission } from '../../middleware/authorize';
import { PERMISSIONS } from '../../shared/constants/roles';
import { listAuditLogsSchema, auditLogIdParamSchema } from './audit.validation';

const router = Router();
const controller = new AuditController();

router.use(authMiddleware);

// ──────────────────────────────────────────────────────────────────────────────
// GET /audit/logs — List audit logs (paginated, filtered)
// ──────────────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /audit/logs:
 *   get:
 *     operationId: listAuditLogs
 *     tags:
 *       - Audit
 *     summary: List audit logs
 *     description: |
 *       Returns a paginated list of audit log entries with optional filters.
 *
 *       **Access control:**
 *       - `SuperAdmin` — sees audit logs from all branches.
 *       - `Admin` — sees only audit logs from users in their own branch.
 *
 *       Requires the `audit:read` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         description: Page number (1-indexed).
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         description: Number of results per page (max 100).
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: userId
 *         description: Filter logs by the ID of the user who performed the action.
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: action
 *         description: "Filter by action type. Examples: LOGIN, USER_CREATE, APPOINTMENT_UPDATE, ROLE_DELETE"
 *         schema: { type: string }
 *         examples:
 *           login:
 *             summary: Login events
 *             value: USER_LOGIN
 *           userCreate:
 *             summary: User creation events
 *             value: USER_CREATE
 *           appointmentCreate:
 *             summary: Appointment creation events
 *             value: APPOINTMENT_CREATE
 *       - in: query
 *         name: search
 *         description: Full-text search across the `action` and `details` fields.
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         description: Return logs created on or after this ISO-8601 datetime.
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         description: Return logs created on or before this ISO-8601 datetime.
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated audit log list.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         logs:
 *                           type: array
 *                           description: Array of audit log entries.
 *                           items:
 *                             $ref: '#/components/schemas/AuditLogDTO'
 *                         meta:
 *                           $ref: '#/components/schemas/PaginationMeta'
 *       400:
 *         description: Validation error — invalid query parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `audit:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/logs', requirePermission(PERMISSIONS.AUDIT_READ), validateRequest(listAuditLogsSchema), controller.listLogs);

// ──────────────────────────────────────────────────────────────────────────────
// GET /audit/logs/:id — Get single audit log
// ──────────────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /audit/logs/{id}:
 *   get:
 *     operationId: getAuditLog
 *     tags:
 *       - Audit
 *     summary: Get a single audit log entry
 *     description: |
 *       Returns the full details of a single audit log entry, including the
 *       associated user information (name, email, branch).
 *
 *       Requires the `audit:read` permission.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         description: The UUID of the audit log entry.
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Audit log entry details.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         log:
 *                           $ref: '#/components/schemas/AuditLogDTO'
 *       400:
 *         description: Validation error — invalid UUID format.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `audit:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Not found — no audit log exists with the given ID.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/logs/:id', requirePermission(PERMISSIONS.AUDIT_READ), validateRequest(auditLogIdParamSchema), controller.getLog);

// ──────────────────────────────────────────────────────────────────────────────
// GET /audit/stats — Audit log statistics
// ──────────────────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /audit/stats:
 *   get:
 *     operationId: getAuditLogStats
 *     tags:
 *       - Audit
 *     summary: Get audit log statistics
 *     description: |
 *       Returns aggregated audit log statistics:
 *       - **totalLogs** — total number of audit log entries.
 *       - **todayCount** — number of entries created today.
 *       - **topActions** — the 10 most frequent action types.
 *       - **topUsers** — the 10 most active users by log count.
 *
 *       **Access control:**
 *       - `SuperAdmin` — stats across all branches.
 *       - `Admin` — stats scoped to their branch only.
 *
 *       Requires the `audit:read` permission.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Audit log statistics.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AuditLogStatsDTO'
 *       401:
 *         description: Unauthorized — missing or invalid JWT token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden — user lacks the `audit:read` permission.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/stats', requirePermission(PERMISSIONS.AUDIT_READ), controller.getStats);

export default router;
