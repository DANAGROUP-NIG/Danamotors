import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/requestValidator";
import {
  isGeneralDepartmentManager,
  requirePermission,
} from "../../middleware/authorize";
import { PERMISSIONS, ROLES } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { ChangeLogFilters, ChangeLogService } from "./changeLog.service";

/**
 * Field-level change log (mounted at /audit/changes, behind authMiddleware in audit.routes.ts).
 * A SuperAdmin sees every change, including those made outside the app. Anyone else with audit:read sees
 * only changes made by users of their own branch.
 */
const router = Router();
const service = new ChangeLogService();

const filterQuery = {
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  userId: z.string().uuid().optional(),
  entity: z.string().max(64).optional(),
  group: z.enum(["MASTER", "TRANSACTION"]).optional(),
  action: z.enum(["INSERT", "UPDATE", "DELETE"]).optional(),
  outsideAppOnly: z.enum(["true", "false"]).optional(),
  record: z.string().max(200).optional(),
};

const listSchema = z.object({
  query: z.object({
    ...filterQuery,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(5000).default(20),
  }),
});
const summarySchema = z.object({ query: z.object(filterQuery) });
const idSchema = z.object({
  params: z.object({ id: z.string().regex(/^\d{1,18}$/, "Invalid change id") }),
});
const historySchema = z.object({
  params: z.object({
    entity: z.string().max(64),
    recordId: z.string().max(200),
  }),
});

function scopeBranch(req: Request): string | undefined {
  return req.user &&
    req.user.role !== ROLES.SUPER_ADMIN &&
    !isGeneralDepartmentManager(req.user)
    ? (req.user.branchId ?? "")
    : undefined;
}

function filtersFrom(req: Request): ChangeLogFilters {
  const q = req.query as Record<string, string | undefined>;
  return {
    dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
    dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    userId: q.userId,
    entity: q.entity,
    group: q.group as ChangeLogFilters["group"],
    action: q.action as ChangeLogFilters["action"],
    outsideAppOnly: q.outsideAppOnly === "true",
    record: q.record || undefined,
    branchId: scopeBranch(req),
  };
}

const handle =
  (fn: (req: Request) => Promise<unknown> | unknown) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res
        .status(200)
        .json({ status: "success", statusCode: 200, data: await fn(req) });
    } catch (error) {
      next(error);
    }
  };

/**
 * @openapi
 * /audit/changes:
 *   get:
 *     operationId: listChangeLog
 *     tags: [Audit]
 *     summary: Field-level change log (who changed which field of which record, old and new value)
 *     description: |
 *       Filters: dateFrom, dateTo, userId, entity, group (MASTER/TRANSACTION), action (INSERT/UPDATE/DELETE),
 *       outsideAppOnly (changes made directly in the database), record (record id or label).
 *       Requires `audit:read`. Non-SuperAdmins see only changes by users of their branch.
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ changes, meta }" }
 */
router.get(
  "/",
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateRequest(listSchema),
  handle((req) =>
    service.list(
      filtersFrom(req),
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20,
    ),
  ),
);

/**
 * @openapi
 * /audit/changes/summary:
 *   get:
 *     operationId: changeLogSummary
 *     tags: [Audit]
 *     summary: Change counts per user × record type × action (same filters as /audit/changes)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ rows, total }" }
 */
router.get(
  "/summary",
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateRequest(summarySchema),
  handle((req) => service.summary(filtersFrom(req))),
);

/**
 * @openapi
 * /audit/changes/entities:
 *   get:
 *     operationId: changeLogEntities
 *     tags: [Audit]
 *     summary: Record types that have a change log, with their group (MASTER or TRANSACTION)
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ entities }" }
 */
router.get(
  "/entities",
  requirePermission(PERMISSIONS.AUDIT_READ),
  handle(() => ({ entities: service.entities() })),
);

/**
 * @openapi
 * /audit/changes/{id}:
 *   get:
 *     operationId: getChangeLogEntry
 *     tags: [Audit]
 *     summary: One change with its field-by-field old and new values
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ change }" }
 *       404: { description: Not found or outside your branch }
 */
router.get(
  "/:id",
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateRequest(idSchema),
  handle(async (req) => {
    const change = await service.get(BigInt(req.params.id), scopeBranch(req));
    if (!change) throw new NotFoundError("Change not found");
    return { change };
  }),
);

/**
 * @openapi
 * /audit/changes/{entity}/{recordId}:
 *   get:
 *     operationId: changeLogRecordHistory
 *     tags: [Audit]
 *     summary: Every change to one record, oldest first
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: "{ changes }" }
 */
router.get(
  "/:entity/:recordId",
  requirePermission(PERMISSIONS.AUDIT_READ),
  validateRequest(historySchema),
  handle(async (req) => ({
    changes: await service.history(
      req.params.entity,
      req.params.recordId,
      scopeBranch(req),
    ),
  })),
);

export default router;
