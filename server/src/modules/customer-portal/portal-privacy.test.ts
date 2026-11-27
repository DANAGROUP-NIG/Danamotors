jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
    jobCard: { findMany: jest.fn(), findFirst: jest.fn() },
    vehicle: { findMany: jest.fn(), findFirst: jest.fn() },
    invoice: { findMany: jest.fn(), findFirst: jest.fn() },
    customerCreditApplication: { findMany: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { PortalRepository } from './portal.repository';
import { PortalService } from './portal.service';
import { jobScope } from '../reports/report.repository';

describe('Portal monthly history privacy', () => {
    beforeEach(() => jest.resetAllMocks());
    it('keeps the PDI/cancellation scope when a caller supplies a status', async () => {
        await new PortalRepository().listJobCards('customer', { status: 'CANCELLED' });
        const query = (prisma.jobCard.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND).toEqual([jobScope({}), { status: 'CANCELLED' }]);
        expect(query.include).not.toHaveProperty('technician');
    });
    it('applies the PDI scope to vehicle jobs and invoice relations', async () => {
        await new PortalRepository().listVehicles('customer');
        await new PortalRepository().listInvoices('customer');
        expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].include.jobCards.where).toEqual(jobScope({}));
        expect((prisma.invoice.findMany as jest.Mock).mock.calls[0][0].where.OR).toContainEqual({ jobCard: { is: jobScope({}) } });
    });
    it('does not serialize internal staff names even if a legacy repository supplies them', async () => {
        (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ id: 'j', jobNumber: 'J', technician: { firstName: 'Internal', lastName: 'Person' }, serviceAdvisor: { firstName: 'Internal' }, engineer: { firstName: 'Internal' }, vehicle: null, branch: { name: 'Branch' }, estimates: [], invoices: [], inspections: [] }]);
        const result = await new PortalService().getJobCards('customer', {});
        expect(JSON.stringify(result)).not.toContain('Internal');
        expect(result[0]).not.toHaveProperty('technician');
    });
    it('hides credit requester names and PDI invoice applications', async () => {
        await new PortalService().getCreditApplications('customer');
        const query = (prisma.customerCreditApplication.findMany as jest.Mock).mock.calls[0][0];
        expect(query.include.requestedBy.select).toEqual({ id: true });
        expect(query.where.OR).toContainEqual({ invoice: { jobCard: { is: jobScope({}) } } });
    });
    it('exposes the customer warranty line at zero without exposing catalogue cost', async () => {
        const warranty = { id: 'part', description: 'Covered part', quantity: 1, rate: 0, amount: 0, isUnderWarranty: true };
        (prisma.invoice.findFirst as jest.Mock).mockResolvedValue({ id: 'invoice', total: 100, lines: [warranty] });
        const invoice = await new PortalService().getInvoice('customer', 'invoice');
        expect(invoice.lines).toContainEqual(warranty);
        const [query] = (prisma.invoice.findFirst as jest.Mock).mock.calls[0];
        expect(query.where).toMatchObject({ id: 'invoice', customerId: 'customer' });
        expect(query.include.lines.select).toEqual({ id: true, description: true, quantity: true, rate: true, amount: true, isUnderWarranty: true });
    });
});
