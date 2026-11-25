import { Router, type Request } from "express";
import { authMiddleware } from "../../middleware/authMiddleware";
import {
  assertBranchOwnership,
  requirePermission,
} from "../../middleware/authorize";
import { validateRequest } from "../../middleware/requestValidator";
import { PERMISSIONS } from "../../shared/constants/roles";
import {
  BadRequestError,
  UnauthorizedError,
} from "../../shared/errors/appError";
import { CsiMasterService } from "./csi.service";
import {
  attributeBody,
  cardCreateBody,
  cardUpdateBody,
  masterListQuery,
  masterParams,
  masterQuery,
  responseBody,
} from "./csi.validation";
import { z } from "zod";
import issuanceRoutes from "./csi-issuance.routes";
import responseRoutes from "./csi-response.routes";

const router = Router();
const service = new CsiMasterService();
router.use(authMiddleware);
router.use("/surveys", responseRoutes);
router.use("/surveys", issuanceRoutes);
const read = requirePermission(PERMISSIONS.CSI_MASTER_READ);
const update = requirePermission(PERMISSIONS.CSI_MASTER_UPDATE);

function scope(req: Request, requested?: string) {
  if (!req.user) throw new UnauthorizedError();
  assertBranchOwnership(req, requested);
  const branchId = requested ?? req.user.branchId;
  if (!branchId) throw new BadRequestError("Select a workshop branch");
  return { branchId, actorId: req.user.userId };
}

const create = (body: z.ZodTypeAny) => z.object({ query: masterQuery, body });
const patch = (body: z.ZodTypeAny) =>
  create(body).extend({ params: masterParams });

for (const kind of ["attributes", "responses", "cards"] as const) {
  router.get(
    "/" + kind,
    read,
    validateRequest(z.object({ query: masterListQuery })),
    async (req, res, next) => {
      try {
        const { page, branchId } = masterListQuery.parse(req.query);
        const data = await service.list(
          scope(req, branchId).branchId,
          kind,
          page,
        );
        res.json({ status: "success", statusCode: 200, data });
      } catch (error) {
        next(error);
      }
    },
  );
}

const send =
  (
    status: number,
    save: (req: Request) => Promise<unknown>,
  ): import("express").RequestHandler =>
  async (req, res, next) => {
    try {
      const data = await save(req);
      res.status(status).json({ status: "success", statusCode: status, data });
    } catch (error) {
      next(error);
    }
  };
const writeScope = (req: Request) =>
  scope(req, masterQuery.parse(req.query).branchId);

router.post(
  "/attributes",
  update,
  validateRequest(create(attributeBody)),
  send(201, (req) =>
    service.saveAttribute(writeScope(req), attributeBody.parse(req.body)),
  ),
);
router.patch(
  "/attributes/:id",
  update,
  validateRequest(patch(attributeBody)),
  send(200, (req) =>
    service.saveAttribute(
      writeScope(req),
      attributeBody.parse(req.body),
      req.params.id,
    ),
  ),
);
router.post(
  "/responses",
  update,
  validateRequest(create(responseBody)),
  send(201, (req) =>
    service.saveResponse(writeScope(req), responseBody.parse(req.body)),
  ),
);
router.patch(
  "/responses/:id",
  update,
  validateRequest(patch(responseBody)),
  send(200, (req) =>
    service.saveResponse(
      writeScope(req),
      responseBody.parse(req.body),
      req.params.id,
    ),
  ),
);
router.post(
  "/cards",
  update,
  validateRequest(create(cardCreateBody)),
  send(201, (req) =>
    service.saveCard(writeScope(req), cardCreateBody.parse(req.body)),
  ),
);
router.patch(
  "/cards/:id",
  update,
  validateRequest(patch(cardUpdateBody)),
  send(200, (req) => {
    const { version, ...data } = cardUpdateBody.parse(req.body);
    return service.saveCard(writeScope(req), data, {
      id: req.params.id,
      version,
    });
  }),
);

export default router;
