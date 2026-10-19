import { Router, Request } from 'express';
import prisma from '../../prisma/client';
import { authMiddleware } from '../../middleware/authMiddleware';
import { requirePermission, requireRole } from '../../middleware/authorize';
import { validateRequest } from '../../middleware/requestValidator';
import { ROLES } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';
import { z } from 'zod';
import { REPORT_SLUGS } from './report.types';
import { reportQueries, selectionQuery, ReportInput } from './report.validation';
import { ReportsService } from './reports.service';
import { CorporateService } from './corporate.service';
import { partsVatSettings, partsVatRatesSchema } from '../finance/parts-vat';
export function reportBranch(req: Request, branchId?: string) {
    if (req.user?.role === ROLES.ADMIN || req.user?.role === ROLES.SUPER_ADMIN)
        return branchId;
    if (!req.user?.branchId)
        throw new ForbiddenError('Your account must be assigned to a branch');
    if (branchId && branchId !== req.user.branchId)
        throw new ForbiddenError('You can only access reports for your branch');
    return req.user.branchId;
}
const router = Router();
router.use(authMiddleware);
const corporateBody = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(150), active: z.boolean().default(true) }).strict();
router.get('/corporate-options', requirePermission('report:corporate-bills'), async (_req, res, next) => {
    try {
        res.json({ status: 'success', statusCode: 200, data: await prisma.corporateGroup.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }) });
    }
    catch (e) {
        next(e);
    }
});
router.get('/corporate-groups', requirePermission('corporate:manage'), requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), async (_req, res, next) => {
    try {
        res.json({ status: 'success', statusCode: 200, data: await new CorporateService().list() });
    }
    catch (e) {
        next(e);
    }
});
router.post('/corporate-groups', requirePermission('corporate:manage'), requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), validateRequest(z.object({ body: corporateBody })), async (req, res, next) => {
    try {
        res.status(201).json({ status: 'success', statusCode: 201, data: await new CorporateService().save(undefined, req.body, req.user!.userId) });
    }
    catch (e) {
        next(e);
    }
});
router.put('/corporate-groups/:id', requirePermission('corporate:manage'), requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), validateRequest(z.object({ params: z.object({ id: z.string().uuid() }), body: corporateBody })), async (req, res, next) => {
    try {
        res.json({ status: 'success', statusCode: 200, data: await new CorporateService().save(req.params.id, req.body, req.user!.userId) });
    }
    catch (e) {
        next(e);
    }
});
router.post('/corporate-groups/:id/vehicles', requirePermission('corporate:manage'), requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), validateRequest(z.object({ params: z.object({ id: z.string().uuid() }), body: z.object({ vins: z.array(z.string().trim().min(1).max(100)).min(1).max(1000), remove: z.boolean().default(false), allowMove: z.boolean().default(false) }).strict() })), async (req, res, next) => {
    try {
        res.json({ status: 'success', statusCode: 200, data: await new CorporateService().membership(req.params.id, req.body, req.user!.userId) });
    }
    catch (e) {
        next(e);
    }
});
router.get('/billing-settings', requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), async (_req, res, next) => {
    try {
        res.json({ status: 'success', statusCode: 200, data: await partsVatSettings(prisma) });
    }
    catch (e) {
        next(e);
    }
});
router.put('/billing-settings', requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN), validateRequest(z.object({ body: z.object({ enabled: z.boolean(), rates: partsVatRatesSchema }).strict() })), async (req, res, next) => {
    try {
        await prisma.$transaction(async (tx) => {
            for (const [key, value] of [['JOB_BILL_PARTS_VAT_ENABLED', req.body.enabled], ['partsVatRates', req.body.rates]] as const)
                await tx.financeSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
            await tx.auditLog.create({ data: { userId: req.user!.userId, action: 'PARTS_VAT_SETTINGS_CHANGED', details: JSON.stringify(req.body) } });
        });
        res.json({ status: 'success', statusCode: 200, data: req.body });
    }
    catch (e) {
        next(e);
    }
});
router.get('/selections', validateRequest(z.object({ query: selectionQuery })), async (req, res, next) => {
    try {
        if (req.user?.role !== ROLES.SUPER_ADMIN && !REPORT_SLUGS.some(s => req.user?.permissions.includes('report:' + s)))
            throw new ForbiddenError('A monthly report permission is required');
        const branchId = reportBranch(req, req.query.branchId as string | undefined);
        const [masters, staff, vehicles] = await Promise.all([prisma.workshopMaster.findMany({ where: { active: true, kind: { in: ['MODEL', 'VARIANT', 'SERVICE_TYPE', 'TEAM'] } }, select: { id: true, kind: true, code: true, description: true, parentId: true }, orderBy: { code: 'asc' } }), prisma.user.findMany({ where: { branchId, isActive: true }, select: { id: true, firstName: true, lastName: true } }), prisma.vehicle.findMany({ where: { OR: [{ jobCards: { some: { branchId } } }, ...(branchId ? [{ customer: { branchId } }] : [])] }, select: { id: true, vin: true, registrationNumber: true }, orderBy: { vin: 'asc' }, take: 1000 })]);
        res.json({ status: 'success', statusCode: 200, data: { masters, staff, vehicles } });
    }
    catch (e) {
        next(e);
    }
});
for (const slug of REPORT_SLUGS)
    router.get('/' + slug, requirePermission('report:' + slug), validateRequest(z.object({ query: reportQueries[slug] })), async (req, res, next) => {
        try {
            const input: ReportInput = { ...req.query, branchId: reportBranch(req, req.query.branchId as string | undefined) };
            if (slug === 'vehicle-history-card' && input.includePdi === 'true' && req.user?.role !== ROLES.SUPER_ADMIN && !req.user?.permissions.includes('pdi:read'))
                throw new ForbiddenError('Including PDI requires pdi:read');
            res.setHeader('Cache-Control', 'no-store');
            res.json({ status: 'success', statusCode: 200, data: await new ReportsService().report(slug, input) });
        }
        catch (e) {
            next(e);
        }
    });
export default router;
