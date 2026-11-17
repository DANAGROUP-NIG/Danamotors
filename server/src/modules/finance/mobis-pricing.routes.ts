import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../../middleware/authMiddleware";
import { requireAnyPermission, requirePermission } from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  applyBulletin,
  getAdjustment,
  getMobisPricing,
  listAdjustments,
  previewBulletin,
  previewRevaluation,
  saveMobisPricing,
} from "./mobis-pricing.service";

/**
 * Finance → Mobis pricing (/api/finance/mobis-pricing). Any staff user may read the conversion rate (the
 * MIT screen shows it); changing it, the dealer factor or part prices needs mobispricing:manage.
 * See doc/mobis-pricing.md.
 */
const router = Router();
router.use(authMiddleware);

const wrap =
  (fn: (req: Request) => Promise<unknown>, status = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json({ status: "success", data: await fn(req) });
    } catch (error) {
      next(error);
    }
  };

const rate = z.number().positive("The conversion rate must be above zero").max(1_000_000);
const factor = z.number().positive("The dealer factor must be above zero").max(1, "The dealer factor cannot be above 1");
const lines = z
  .array(z.object({ partNumber: z.string().trim().min(1).max(40), listPrice: z.number().positive().max(10_000_000) }))
  .min(1, "The bulletin has no parts")
  .max(20_000, "A bulletin can have at most 20,000 parts");

const saveSchema = z.object({
  body: z.object({
    conversionRate: rate,
    dealerFactor: factor,
    revalue: z.boolean().optional(),
    remarks: z.string().trim().max(500).optional(),
  }),
});
const revaluationSchema = z.object({ query: z.object({ rate: z.coerce.number().positive() }) });
const previewSchema = z.object({ body: z.object({ lines }) });
const applySchema = z.object({
  body: z.object({
    reference: z.string().trim().min(3, "Give the bulletin reference").max(200),
    sourceFileName: z.string().trim().max(200).optional(),
    effectiveDate: z.coerce.date().optional(),
    remarks: z.string().trim().max(500).optional(),
    conversionRate: rate,
    dealerFactor: factor,
    lines,
  }),
});
const idSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ page: z.coerce.number().int().min(1).optional() }),
});

const manage = requirePermission(PERMISSIONS.MOBIS_PRICING_MANAGE);
const readRuns = requireAnyPermission(PERMISSIONS.MOBIS_PRICING_MANAGE, PERMISSIONS.AUDIT_READ);

router.get("/", wrap(() => getMobisPricing()));
router.put("/", manage, validateRequest(saveSchema), wrap((req) => saveMobisPricing({ userId: req.user!.userId }, req.body)));
router.get("/revaluation-preview", manage, validateRequest(revaluationSchema), wrap((req) => previewRevaluation(Number(req.query.rate))));
router.post("/bulletins/preview", manage, validateRequest(previewSchema), wrap((req) => previewBulletin(req.body.lines)));
router.post("/bulletins", manage, validateRequest(applySchema), wrap((req) => applyBulletin({ userId: req.user!.userId }, req.body), 201));
router.get("/adjustments", readRuns, wrap(() => listAdjustments()));
router.get("/adjustments/:id", readRuns, validateRequest(idSchema), wrap((req) => getAdjustment(req.params.id, Number(req.query.page ?? 1))));

export default router;
