import { Router, type Request } from "express";
import { z } from "zod";
import {
  requirePermission,
  assertBranchOwnership,
} from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  BadRequestError,
  UnauthorizedError,
} from "../../shared/errors/appError";
import {
  generationBody,
  issuanceQuery,
  issuanceScope,
  printBody,
} from "./csi-issuance.validation";
import { CsiIssuanceService } from "./csi-issuance.service";

const router = Router();
const service = new CsiIssuanceService();
router.use(requirePermission(PERMISSIONS.CSI_CARD_GENERATE));
function scope(req: Request, requested?: string) {
  if (!req.user) throw new UnauthorizedError();
  assertBranchOwnership(req, requested);
  const branchId = requested ?? req.user.branchId;
  if (!branchId)
    throw new BadRequestError(
      "Select a workshop branch before generating CSI cards",
    );
  return { branchId, actorId: req.user.userId };
}
router.get(
  "/options",
  validateRequest(z.object({ query: issuanceScope })),
  async (req, res, next) => {
    try {
      const selected = scope(req, issuanceScope.parse(req.query).branchId);
      res.json({
        status: "success",
        data: await service.options(selected.branchId),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/",
  validateRequest(z.object({ query: issuanceQuery })),
  async (req, res, next) => {
    try {
      const input = issuanceQuery.parse(req.query);
      res.json({
        status: "success",
        data: await service.candidates(
          scope(req, input.branchId).branchId,
          input,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/generate",
  validateRequest(z.object({ query: issuanceScope, body: generationBody })),
  async (req, res, next) => {
    try {
      const selected = scope(req, issuanceScope.parse(req.query).branchId);
      res
        .status(201)
        .json({
          status: "success",
          data: await service.generate(
            selected,
            generationBody.parse(req.body).jobCardIds,
          ),
        });
    } catch (error) {
      next(error);
    }
  },
);
router.post(
  "/print",
  validateRequest(z.object({ query: issuanceScope, body: printBody })),
  async (req, res, next) => {
    try {
      const selected = scope(req, issuanceScope.parse(req.query).branchId);
      res.json({
        status: "success",
        data: await service.print(
          selected,
          printBody.parse(req.body).surveyIds,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
