import { NextFunction, Request, Response, Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { canAccessAllBranches, requirePermission } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { UnauthorizedError } from '../../shared/errors/appError';
import { RequisitionService } from '../requisition/requisition.service';
import { ReturnSlipService } from '../requisition/return-slip.service';
import { cancelRequisitionSchema, createRequisitionSchema, requisitionIdSchema } from '../requisition/requisition.validation';
import { cancelReturnSlipSchema, createReturnSlipSchema, returnSlipIdSchema } from '../requisition/return-slip.validation';
import { LabourSlipService } from '../service/labour-slip.service';
import { addLabourSlipLineSchema, createLabourSlipSchema, labourSlipIdSchema, updateLabourSlipLineSchema } from '../service/labour-slip.validation';
import { PdiBillService } from './pdi-bill.service';
import { PdiActor, PdiService } from './pdi.service';
import { getPdiSettingsView, updatePdiSettings } from './pdi.settings.service';
import {
  listPdiSchema, pdiBillCancelSchema, pdiBillPreviewSchema, pdiBillSchema, pdiCancelSchema, pdiDefectSearchSchema, pdiDocumentListSchema,
  pdiIdSchema, pdiOpenSchema, pdiOptionsSchema, pdiPrintSchema, pdiReadySchema, pdiSettingsSchema, pdiUpdateSchema, pdiVehicleSchema,
  pdiVinSchema, pdiWorkDoneSchema,
} from './pdi.validation';

// Endpoint docs and examples: pdi.openapi.ts.
const router = Router();
const service = new PdiService();
const bills = new PdiBillService();
const requisitions = new RequisitionService();
const returns = new ReturnSlipService();
const labour = new LabourSlipService();
router.use(authMiddleware);

const has = (req: Request, permission: string) => req.user?.role === ROLES.SUPER_ADMIN || !!req.user?.permissions.includes(permission);

function actor(req: Request): PdiActor {
  if (!req.user) throw new UnauthorizedError();
  return { userId: req.user.userId, branchId: req.user.branchId, allBranches: canAccessAllBranches(req.user) };
}

/** Requisition, return and labour documents recorded from the PDI menu: PDI jobs only. */
function documentActor(req: Request, goodwillPermission: string) {
  return { ...actor(req), goodwill: has(req, goodwillPermission), pdi: true, pdiOnly: true };
}

type Handler = (req: Request) => Promise<unknown>;
const send = (status: number, handler: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(status).json({ status: 'success', statusCode: status, data: await handler(req) });
  } catch (error) { next(error); }
};
const read = requirePermission(PERMISSIONS.PDI_READ);
const create = requirePermission(PERMISSIONS.PDI_CREATE);
const update = requirePermission(PERMISSIONS.PDI_UPDATE);
const bill = requirePermission(PERMISSIONS.PDI_BILL);

// Settings and lookups
router.get('/settings', read, send(200, () => getPdiSettingsView()));
router.put('/settings', requirePermission(PERMISSIONS.PDI_SETTINGS), validateRequest(pdiSettingsSchema), send(200, req => updatePdiSettings(pdiSettingsSchema.parse({ body: req.body }).body, actor(req).userId)));
router.get('/service-types', create, validateRequest(pdiOptionsSchema), send(200, req => {
  const { query } = pdiOptionsSchema.parse({ query: req.query });
  return service.serviceTypes(query.vehicleId, query.date);
}));
router.get('/defects', read, validateRequest(pdiDefectSearchSchema), send(200, async req => ({ items: await service.defects(pdiDefectSearchSchema.parse({ query: req.query }).query) })));
router.get('/vehicles', read, validateRequest(pdiVinSchema), send(200, async req => ({ items: await service.findVehicles(pdiVinSchema.parse({ query: req.query }).query.vin) })));
router.post('/vehicles', create, validateRequest(pdiVehicleSchema), send(201, req => service.createVehicle(pdiVehicleSchema.parse({ body: req.body }).body, actor(req).userId)));
router.get('/vehicles/:id/jobs', read, validateRequest(pdiIdSchema), send(200, async req => ({ items: await service.vehiclePdiJobs(req.params.id, actor(req)) })));

// Requisitions (IPO) and returns
router.get('/requisitions', read, validateRequest(pdiDocumentListSchema), send(200, req => service.requisitions(pdiDocumentListSchema.parse({ query: req.query }).query, actor(req))));
router.post('/requisitions', update, validateRequest(createRequisitionSchema), send(201, req => requisitions.create(req.body, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));
router.get('/requisitions/:id', read, validateRequest(requisitionIdSchema), send(200, req => requisitions.get(req.params.id, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));
router.post('/requisitions/:id/cancel', update, validateRequest(cancelRequisitionSchema), send(200, req => requisitions.cancel(req.params.id, req.body.reason, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));
router.get('/returns', read, validateRequest(pdiDocumentListSchema), send(200, req => service.returns(pdiDocumentListSchema.parse({ query: req.query }).query, actor(req))));
router.post('/returns', update, validateRequest(createReturnSlipSchema), send(201, req => returns.create(req.body, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));
router.get('/returns/:id', read, validateRequest(returnSlipIdSchema), send(200, req => returns.get(req.params.id, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));
router.post('/returns/:id/cancel', update, validateRequest(cancelReturnSlipSchema), send(200, req => returns.cancel(req.params.id, req.body.reason, documentActor(req, PERMISSIONS.REQUISITION_GOODWILL))));

// Labour slips
router.get('/labour-slips', read, validateRequest(pdiDocumentListSchema), send(200, req => service.labourSlips(pdiDocumentListSchema.parse({ query: req.query }).query, actor(req))));
router.post('/labour-slips', update, validateRequest(createLabourSlipSchema), send(201, req => labour.create(req.body, documentActor(req, PERMISSIONS.WARRANTY_UPDATE))));
router.get('/labour-slips/:id', read, validateRequest(labourSlipIdSchema), send(200, req => labour.get(req.params.id, documentActor(req, PERMISSIONS.WARRANTY_UPDATE))));
router.post('/labour-slips/:id/lines', update, validateRequest(addLabourSlipLineSchema), send(200, req => labour.save(req.params.id, req.body, documentActor(req, PERMISSIONS.WARRANTY_UPDATE))));
router.put('/labour-slips/:id/lines/:lineId', update, validateRequest(updateLabourSlipLineSchema), send(200, req => labour.save(req.params.id, req.body, documentActor(req, PERMISSIONS.WARRANTY_UPDATE), req.params.lineId)));

// Bills
router.get('/bills', read, validateRequest(pdiDocumentListSchema), send(200, req => bills.list(pdiDocumentListSchema.parse({ query: req.query }).query, actor(req))));
router.post('/bills/preview', bill, validateRequest(pdiBillPreviewSchema), send(200, req => bills.preview(pdiBillPreviewSchema.parse({ body: req.body }).body, actor(req))));
router.post('/bills', bill, validateRequest(pdiBillSchema), send(201, req => bills.create(pdiBillSchema.parse({ body: req.body }).body, actor(req))));
router.get('/bills/:id', read, validateRequest(pdiIdSchema), send(200, req => bills.get(req.params.id, actor(req))));
router.post('/bills/:id/cancel', bill, validateRequest(pdiBillCancelSchema), send(200, req => bills.cancel(req.params.id, req.body.reason, actor(req))));

// First print of any PDI document (edit-after-print rules apply from then)
router.post('/print/:kind/:id', read, validateRequest(pdiPrintSchema), send(200, req => {
  const { params } = pdiPrintSchema.parse({ params: req.params });
  return service.markPrinted(params.kind, params.id, actor(req));
}));

// PDI job cards
router.get('/', read, validateRequest(listPdiSchema), send(200, req => service.list(listPdiSchema.parse({ query: req.query }).query, actor(req))));
router.post('/', create, validateRequest(pdiOpenSchema), send(201, req => service.open(pdiOpenSchema.parse({ body: req.body }).body, actor(req))));
router.get('/:id', read, validateRequest(pdiIdSchema), send(200, req => service.get(req.params.id, actor(req))));
router.patch('/:id', update, validateRequest(pdiUpdateSchema), send(200, req => service.update(req.params.id, pdiUpdateSchema.parse({ params: req.params, body: req.body }).body, actor(req))));
router.post('/:id/work-done', update, validateRequest(pdiWorkDoneSchema), send(200, req => service.workDone(req.params.id, req.body.workDone, actor(req))));
router.post('/:id/vehicle-ready', update, validateRequest(pdiReadySchema), send(200, req => service.vehicleReady(req.params.id, req.body.remarks, actor(req))));
router.post('/:id/cancel', update, validateRequest(pdiCancelSchema), send(200, req => service.cancel(req.params.id, req.body.reason, actor(req))));

export default router;
