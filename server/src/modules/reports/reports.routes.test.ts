import type { Request, Response, NextFunction } from 'express';
import router, { reportBranch } from './reports.routes';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from '../../shared/constants/roles';
import { REPORT_SLUGS } from './report.types';
import { requirePermission } from '../../middleware/authorize';
import { ReportsService } from './reports.service';
const req = (role: string, branchId?: string, permissions: string[] = []) => ({ user: { role, branchId, permissions, userId: 'u' } } as unknown as Request);
describe('Monthly report authorization', () => {
    it('rejects PDI history before querying data without pdi:read', async () => {
        const stack = router.stack as Array<{
            route?: {
                path: string;
                stack: Array<{
                    handle: (req: Request, res: Response, next: NextFunction) => Promise<void>;
                }>;
            };
        }>;
        const handler = stack.find(l => l.route?.path === '/vehicle-history-card')!.route!.stack.at(-1)!.handle;
        const request = req(ROLES.WORKSHOP_MANAGER, 'own', ['report:vehicle-history-card']);
        request.query = { includePdi: 'true' };
        const next = jest.fn();
        const service = jest.spyOn(ReportsService.prototype, 'report');
        await handler(request, {} as Response, next);
        expect(next.mock.calls[0][0].message).toContain('pdi:read');
        expect(service).not.toHaveBeenCalled();
        service.mockRestore();
    });
    it('rejects missing branches and cross-branch requests; admins can select all', () => { expect(() => reportBranch(req(ROLES.WORKSHOP_MANAGER), 'other')).toThrow(); expect(() => reportBranch(req(ROLES.WORKSHOP_MANAGER, 'own'), 'other')).toThrow(); expect(reportBranch(req(ROLES.WORKSHOP_MANAGER, 'own'))).toBe('own'); expect(reportBranch(req(ROLES.ADMIN))).toBeUndefined(); });
    it('gives report permissions according to the issue', () => { const all = REPORT_SLUGS.map(s => 'report:' + s); expect(ROLE_PERMISSIONS[ROLES.WORKSHOP_MANAGER]).toEqual(expect.arrayContaining(all)); expect(ROLE_PERMISSIONS[ROLES.ACCOUNTANT]).toEqual(expect.arrayContaining([PERMISSIONS.TAX_REGISTER_READ, PERMISSIONS.CORPORATE_BILLS_READ, PERMISSIONS.UNBILLED_PARTS_READ])); expect(ROLE_PERMISSIONS[ROLES.ACCOUNTANT]).not.toContain(PERMISSIONS.VEHICLE_HISTORY_CARD_READ); expect(ROLE_PERMISSIONS[ROLES.SERVICE_ADVISOR]).toContain(PERMISSIONS.DELIVERED_MODEL_READ); });
    it.each(REPORT_SLUGS)('registers a guarded validated GET endpoint for %s', slug => {
        const stack = router.stack as Array<{
            route?: {
                path: string;
                methods: {
                    get?: boolean;
                };
                stack: unknown[];
            };
        }>;
        const route = stack.find(l => l.route?.path === '/' + slug)?.route;
        expect(route?.methods.get).toBe(true);
        expect(route?.stack).toHaveLength(3);
    });
    it('rejects a direct API request without the report permission', () => { expect(() => requirePermission('report:tax-register')(req(ROLES.SERVICE_ADVISOR, 'b'), {} as Response, jest.fn() as NextFunction)).toThrow('permissions'); });
});
