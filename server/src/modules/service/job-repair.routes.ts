import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { myJobsQuery, repairFindingBody, workLineActionBody } from "./job-repair.logic";
import { JobRepairService, type RepairActor } from "./job-repair.service";

const service = new JobRepairService();
const actor = (req: Request): RepairActor => ({ id: req.user!.userId, role: req.user!.role, permissions: req.user!.permissions, branchId: req.user!.branchId ?? null });
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });

/** Every repair route: the job must exist and be in a branch this person can work in. */
async function jobBranchAccess(req: Request, _res: Response, next: NextFunction) {
  try {
    jobParams.parse(req.params);
    const job = await prisma.jobCard.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
    if (!job) throw new NotFoundError("Job card not found");
    assertBranchOwnership(req, job.branchId);
    next();
  } catch (error) {
    next(error);
  }
}

const handle =
  (run: (req: Request) => Promise<unknown>, message?: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ status: "success", statusCode: 200, ...(message && { message }), data: await run(req) });
    } catch (error) {
      next(error);
    }
  };

/**
 * @openapi
 * /api/service/job-cards/{id}/repair:
 *   get:
 *     tags: [Service]
 *     summary: The repair step (job card revamp phase 6)
 *     description: 'Requires jobcard:read and branch access. Work lines (status NOT_STARTED, IN_PROGRESS, WAITING_PARTS or DONE, technician, start and done times, seconds worked, approved hours), what blocks the quality check, findings raised during repair with their state (WAITING_ESTIMATE, WAITING_APPROVAL, APPROVED, DECLINED), parts (requested, issued, collected with who and when; ready and outstanding counts; the issues the technician can collect), labour recorded, the open supplementary revision and a return from the quality check. Never prices.'
 *     responses:
 *       200: { description: 'status=success, data=repair step' }
 *       403: { description: Permission or branch access denied }
 *       404: { description: Job card not found }
 * /api/service/job-cards/{id}/repair/lines/{lineId}:
 *   post:
 *     tags: [Service]
 *     summary: Start, finish or set a work line to waiting parts
 *     description: 'Requires jobcard:update; the assigned technician or a workshop supervisor, job in repair. Body { action: START | DONE | WAIT_PARTS, requestId }. Done records the labour on the job''s labour slip at the approved hours, in the same transaction. A repeated requestId changes nothing. 409 WORK_LINE_BLOCKED with reasons when the move is not possible.'
 *     responses:
 *       200: { description: 'status=success, data=repair step' }
 *       403: { description: Not the assigned technician or supervisor }
 *       409: { description: Move not possible (reasons in details) }
 * /api/service/job-cards/{id}/repair/findings:
 *   post:
 *     tags: [Service]
 *     summary: Need a part, or add a finding, during repair
 *     description: 'Requires jobcard:update; the assigned technician or a workshop supervisor, job in repair. Body { requestId, kind: PART | FINDING, description, items: [{ kind: LABOUR | PART, referenceId, quantity }] }. Saved as a finding raised during repair; the service advisor is told through the workshop outbox. A repeated requestId saves once.'
 *     responses:
 *       200: { description: 'status=success, data=repair step' }
 *       400: { description: Invalid input naming the field }
 *       403: { description: Not the assigned technician or supervisor }
 * /api/service/my-jobs:
 *   get:
 *     tags: [Service]
 *     summary: The technician's My jobs home (job card revamp phase 6)
 *     description: 'Requires jobcard:read. Jobs assigned to this person in their own branch, tab TODAY (diagnosis findings or repair in progress), WAITING_PARTS or DONE (sent for the quality check today, Lagos time), with counts for every tab, page and limit (20, at most 50). Each job has plate, model, bay, step, promised time, a return from the quality check and the next action. No prices.'
 *     responses:
 *       200: { description: 'status=success, data=my jobs' }
 */
export const jobRepairRoutes = Router({ mergeParams: true });
jobRepairRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);
const update = requirePermission(PERMISSIONS.JOBCARD_UPDATE);

jobRepairRoutes.get("/", validateRequest(z.object({ params: jobParams })), handle((req) => service.view(req.params.id, actor(req))));
jobRepairRoutes.post(
  "/lines/:lineId",
  update,
  validateRequest(z.object({ params: jobParams.extend({ lineId: z.string().uuid("Reload the job and try again") }), body: workLineActionBody })),
  handle((req) => service.moveLine(req.params.id, req.params.lineId, actor(req), req.body), "Work updated"),
);
jobRepairRoutes.post(
  "/findings",
  update,
  validateRequest(z.object({ params: jobParams, body: repairFindingBody })),
  handle((req) => service.raiseFinding(req.params.id, actor(req), req.body), "Finding sent to the service advisor"),
);

export const myJobsRoutes = Router();
myJobsRoutes.get(
  "/",
  requirePermission(PERMISSIONS.JOBCARD_READ),
  validateRequest(z.object({ query: myJobsQuery })),
  handle((req) => service.myJobs(actor(req), myJobsQuery.parse(req.query))),
);
