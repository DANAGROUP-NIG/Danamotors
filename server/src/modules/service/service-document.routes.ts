import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { canAccessAllBranches, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS } from '../../shared/constants/roles';
import { ServiceDocumentKind, ServiceDocumentService } from './service-document.service';
import { serviceDocumentIdSchema, serviceRemarksSchema } from './service-document.validation';

const router = Router();
const service = new ServiceDocumentService();
router.use(authMiddleware);
for (const [path, kind, read] of [['job-cards', 'job', PERMISSIONS.JOBCARD_READ], ['estimates', 'estimate', PERMISSIONS.ESTIMATE_READ]] as const satisfies readonly (readonly [string, ServiceDocumentKind, string])[]) {
  router.get(`/${path}/:id/remarks`, requirePermission(read), validateRequest(serviceDocumentIdSchema), async (req, res, next) => {
    try { const remarks = await service.getRemarks(kind, req.params.id, { userId: req.user!.userId, branchId: req.user!.branchId, allBranches: canAccessAllBranches(req.user!) }); res.json({ status: 'success', data: { document: remarks } }); }
    catch (error) { next(error); }
  });
  router.put(`/${path}/:id/remarks`, requirePermission(PERMISSIONS.JOBCARD_REMARKS_UPDATE), validateRequest(serviceRemarksSchema), async (req, res, next) => {
    try { const remarks = await service.updateRemarks(kind, req.params.id, req.body, { userId: req.user!.userId, branchId: req.user!.branchId, allBranches: canAccessAllBranches(req.user!) }); res.json({ status: 'success', data: { document: remarks } }); }
    catch (error) { next(error); }
  });
  router.get(`/${path}/:id/picking-list/print`, requirePermission(PERMISSIONS.JOBCARD_PICKING_LIST_PRINT), validateRequest(serviceDocumentIdSchema), async (req, res, next) => {
    try { const print = await service.pickingPrint(kind, req.params.id, { userId: req.user!.userId, branchId: req.user!.branchId, allBranches: canAccessAllBranches(req.user!) }); res.json({ status: 'success', data: { pickingList: print } }); }
    catch (error) { next(error); }
  });
}
export default router;
