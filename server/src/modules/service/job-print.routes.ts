import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import prisma from "../../prisma/client";
import { assertBranchOwnership, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import { NotFoundError } from "../../shared/errors/appError";
import { JobPrintService } from "./job-print.service";

const service = new JobPrintService();
const jobParams = z.object({ id: z.string().uuid("Open a job card from the list") });

/** The job must exist and be in a branch this person can work in. */
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

const handle = (run: (req: Request) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Prints carry signatures: never kept in a shared cache.
    res.set("Cache-Control", "private, no-store");
    res.json({ status: "success", statusCode: 200, data: await run(req) });
  } catch (error) {
    next(error);
  }
};

/**
 * @openapi
 * /api/service/job-cards/{id}/print:
 *   get:
 *     tags: [Service]
 *     summary: The printed job card, A4 front and back (job card revamp phase 11)
 *     description: 'Requires jobcard:read, estimate:print and branch access; service jobs only (409 JOB_PRINT_PDI for PDI). The paper form, filled from the stored job: Warranty or Non-warranty, customer, vehicle (model, registration, VIN, engine number, sold by, sold on), job number, advisor, km, date, customer requests, instructions to the technician (advisor and supervisor), damage marks, fuel level, the 25 checklist items, cause and nature of defect (findings), estimated and actual (customer amounts before VAT, decimal strings; promised and delivered times), the five signature boxes (name, date and captured signature image, or null for blank lines), the last two visits, and the JOB_CARD terms numbered for the back page. Dates are ISO; the client prints them in Lagos time.'
 *     responses:
 *       200: { description: The print data }
 *       403: { description: Missing permission or another branch }
 *       404: { description: Job card not found }
 *       409: { description: PDI job }
 * /api/service/job-cards/{id}/print/gate-pass:
 *   get:
 *     tags: [Service]
 *     summary: The A6 gate pass slip
 *     description: 'Requires jobcard:read and branch access. Job number, gate pass number, plate, vehicle, customer, who collected it, who delivered it and when. 409 GATE_PASS_NOT_ISSUED before the vehicle is delivered.'
 *     responses:
 *       200: { description: The gate pass data }
 *       409: { description: Not delivered yet }
 */
export const jobPrintRoutes = Router({ mergeParams: true });
jobPrintRoutes.use(requirePermission(PERMISSIONS.JOBCARD_READ), jobBranchAccess);

// The job card carries the customer's signatures and amounts, so it needs the same print permission as the signed copies.
jobPrintRoutes.get(
  "/",
  requirePermission(PERMISSIONS.ESTIMATE_PRINT),
  validateRequest(z.object({ params: jobParams })),
  handle((req) => service.jobCard(req.params.id)),
);
jobPrintRoutes.get("/gate-pass", validateRequest(z.object({ params: jobParams })), handle((req) => service.gatePass(req.params.id)));
