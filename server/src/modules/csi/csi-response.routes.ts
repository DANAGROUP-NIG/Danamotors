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
import { issuanceScope } from "./csi-issuance.validation";
import {
  responseBody,
  responseListQuery,
  surveyParams,
} from "./csi-response.validation";
import { CsiResponseService } from "./csi-response.service";
const router = Router();
const service = new CsiResponseService();
function scope(req: Request, branch?: string) {
  if (!req.user) throw new UnauthorizedError();
  assertBranchOwnership(req, branch);
  const branchId = branch ?? req.user.branchId;
  if (!branchId)
    throw new BadRequestError("Select a workshop branch to open CSI responses");
  return { branchId, actorId: req.user.userId };
}
router.get(
  "/issued",
  requirePermission(PERMISSIONS.CSI_RESPONSE_READ),
  validateRequest(z.object({ query: responseListQuery })),
  async (req, res, next) => {
    try {
      const query = responseListQuery.parse(req.query);
      res.json({
        status: "success",
        data: await service.list(
          scope(req, query.branchId).branchId,
          query.search,
          query.page,
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.get(
  "/issued/:id",
  requirePermission(PERMISSIONS.CSI_RESPONSE_READ),
  validateRequest(z.object({ query: issuanceScope, params: surveyParams })),
  async (req, res, next) => {
    try {
      const selected = scope(req, issuanceScope.parse(req.query).branchId);
      res.json({
        status: "success",
        data: await service.get(selected.branchId, req.params.id),
      });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/issued/:id/responses",
  requirePermission(PERMISSIONS.CSI_RESPONSE_UPDATE),
  validateRequest(
    z.object({
      query: issuanceScope,
      params: surveyParams,
      body: responseBody,
    }),
  ),
  async (req, res, next) => {
    try {
      const selected = scope(req, issuanceScope.parse(req.query).branchId);
      res.json({
        status: "success",
        data: await service.save(
          selected,
          req.params.id,
          responseBody.parse(req.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
