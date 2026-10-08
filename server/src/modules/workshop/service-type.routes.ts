import { Router } from 'express';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';
import { ServiceTypeService } from './service-type.service';
import prisma from '../../prisma/client';
import { z } from 'zod';
import { createSettingSchema, deleteSettingSchema, listSettingsSchema, serviceTypeOptionsSchema, updateSettingSchema } from './service-type.validation';

const service = new ServiceTypeService();
export const serviceTypeOptionsRouter = Router();
serviceTypeOptionsRouter.use(authMiddleware);
const defectSearchSchema = z.object({ query: z.object({
  search: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().positive().max(50).default(20),
}) });
/**
 * @openapi
 * /job-cards/defect-codes:
 *   get:
 *     tags: [Service]
 *     summary: Compact active database defect codes for customer requests
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string, maxLength: 100 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 50, default: 20 } }
 *     responses:
 *       200: { description: data.items contains id, code and description }
 *       403: { description: Job-card create permission required }
 */
serviceTypeOptionsRouter.get('/defect-codes', requirePermission(PERMISSIONS.JOBCARD_CREATE), validateRequest(defectSearchSchema), async (req, res, next) => {
  try {
    const query = defectSearchSchema.parse({ query: req.query }).query;
    const items = await prisma.warrantyDefectCode.findMany({
      where: { isActive: true, ...(query.search ? { OR: [
        { code: { contains: query.search, mode: 'insensitive' as const } },
        { description: { contains: query.search, mode: 'insensitive' as const } },
      ] } : {}) },
      select: { id: true, code: true, description: true }, orderBy: { code: 'asc' }, take: query.limit,
    });
    res.json({ status: 'success', data: { items } });
  } catch (error) { next(error); }
});
/**
 * @openapi
 * /job-cards/service-types:
 *   get:
 *     tags: [Service]
 *     summary: Eligible service types and effective model charges for a vehicle
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: vehicleId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: date, schema: { type: string, format: date } }
 *     responses:
 *       200:
 *         description: data.items contains id, code, description, chargedTo, displayOrder and serviceCharge; data.message explains an empty list
 *       400: { description: Invalid vehicle ID or date }
 *       401: { description: Authentication required }
 *       403: { description: Job-card permission required }
 *       404: { description: Vehicle not found }
 */
serviceTypeOptionsRouter.get('/service-types', requirePermission(PERMISSIONS.JOBCARD_CREATE), validateRequest(serviceTypeOptionsSchema), async (req, res, next) => {
  try {
    const query = serviceTypeOptionsSchema.parse({ query: req.query }).query;
    res.json({ status: 'success', data: await service.options(query.vehicleId, query.date ? new Date(`${query.date}T00:00:00Z`) : undefined) });
  } catch (error) { next(error); }
});

export const serviceTypeSettingsRouter = Router();
serviceTypeSettingsRouter.use(authMiddleware, requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN));
/**
 * @openapi
 * components:
 *   schemas:
 *     ServiceTypeModelSettingInput:
 *       type: object
 *       required: [serviceTypeId, modelId, serviceCharge]
 *       properties:
 *         serviceTypeId: { type: string, format: uuid }
 *         modelId: { type: string, format: uuid, description: WorkshopMaster MODEL ID }
 *         serviceCharge: { type: number, minimum: 0 }
 *         previousCharge: { type: number, minimum: 0, nullable: true }
 *         effectiveFrom: { type: string, format: date-time, nullable: true }
 *         active: { type: boolean, default: true }
 * /service-type-model-settings:
 *   get:
 *     tags: [Workshop masters]
 *     summary: Paginated model charge grid for a service type (admin only)
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: serviceTypeId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: data.items contains settings with model id/code/description; data.meta contains pagination }
 *       403: { description: Admin role required }
 *   post:
 *     tags: [Workshop masters]
 *     summary: Create a model charge setting (admin only)
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ServiceTypeModelSettingInput' }
 *     responses:
 *       201: { description: Setting created in data.item }
 *       400: { description: Invalid charge or master kind }
 *       403: { description: Admin role required }
 *       409: { description: Service type/model pair already exists }
 * /service-type-model-settings/{id}:
 *   put:
 *     tags: [Workshop masters]
 *     summary: Update charges, effective date or active status; master IDs are immutable
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serviceCharge: { type: number, minimum: 0 }
 *               previousCharge: { type: number, minimum: 0, nullable: true }
 *               effectiveFrom: { type: string, format: date-time, nullable: true }
 *               active: { type: boolean }
 *     responses:
 *       200: { description: Updated setting in data.item }
 *       400: { description: Invalid charge or master kind }
 *       403: { description: Admin role required }
 *       404: { description: Setting not found }
 *   delete:
 *     tags: [Workshop masters]
 *     summary: Remove a model charge setting; existing job-card charge snapshots are unchanged
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Setting removed }
 *       403: { description: Admin role required }
 *       404: { description: Setting not found }
 */
serviceTypeSettingsRouter.get('/', validateRequest(listSettingsSchema), async (req, res, next) => {
  try { res.json({ status: 'success', data: await service.listSettings(listSettingsSchema.parse({ query: req.query }).query) }); }
  catch (error) { next(error); }
});
serviceTypeSettingsRouter.post('/', validateRequest(createSettingSchema), async (req, res, next) => {
  try { res.status(201).json({ status: 'success', data: { item: await service.createSetting(req.body) } }); }
  catch (error) { next(error); }
});
serviceTypeSettingsRouter.put('/:id', validateRequest(updateSettingSchema), async (req, res, next) => {
  try { res.json({ status: 'success', data: { item: await service.updateSetting(req.params.id, req.body) } }); }
  catch (error) { next(error); }
});
serviceTypeSettingsRouter.delete('/:id', validateRequest(deleteSettingSchema), async (req, res, next) => {
  try { await service.deleteSetting(req.params.id); res.status(204).send(); }
  catch (error) { next(error); }
});
