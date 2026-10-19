jest.mock('../../prisma/client', () => ({ __esModule: true, default: { jobCard: { findMany: jest.fn() }, vehicle: { findMany: jest.fn() }, invoice: { findMany: jest.fn() }, serviceAppointment: { findMany: jest.fn() }, estimate: { findMany: jest.fn() }, corporateGroup: { findMany: jest.fn() }, sparePart: { findMany: jest.fn() }, labourItem: { findMany: jest.fn() } } }));
import prisma from '../../prisma/client';
import { ReportsService } from './reports.service';
import { reportQueries } from './report.validation';
import { jobScope } from './report.repository';
import { taxRegisterMoneyKeys } from './tax-register-layout';
const base = { branchId: '11111111-1111-4111-8111-111111111111', from: '2026-10-01', to: '2026-10-07' };
const job = { id: 'j', jobNumber: 'J1', createdAt: new Date('2026-10-01T09:00Z'), status: 'DELIVERED', vehicleId: 'v', vehicle: { id: 'v', vin: 'VIN', registrationNumber: 'REG', model: 'Rio', customer: null, catalogModel: null, catalogue: null }, customer: null, serviceType: { description: 'Paid', preDelivery: false }, service: null, lines: [], invoices: [], complaints: [], deliveryAdvisor: null, serviceAdvisor: null };
describe('Monthly report data behavior', () => {
    beforeEach(() => jest.resetAllMocks());
    it('matches estimate labour UUIDs to actual operation codes and preserves stored labour amounts', async () => {
        (prisma.estimate.findMany as jest.Mock).mockResolvedValue([{ id: 'e', estimateNumber: 'E', estimateDate: new Date('2026-10-01'), lines: [{ type: 'LABOUR', referenceId: 'operation-id', description: 'Repair', quantity: 1, amount: 100 }], jobCard: { ...job, lines: [{ kind: 'LABOUR', operationCode: 'OP', description: 'Repair', quantity: 1, rate: 100, amount: 80, partIssuance: null, jobCardLabour: null }] } }]);
        (prisma.sparePart.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.labourItem.findMany as jest.Mock).mockResolvedValue([{ id: 'operation-id', code: 'OP' }]);
        const result = await new ReportsService().report('estimate-vs-job', reportQueries['estimate-vs-job'].parse(base));
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({ itemCode: 'OP', actualAmount: 80, variationAmount: -20 });
    });
    it('returns eleven history sections with schemas even when optional sections have no rows', async () => {
        (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([{ ...job.vehicle, ownerships: [], vehicleModel: null, saleDate: null, jobCards: [job], _count: { jobCards: 1 } }]);
        const result = await new ReportsService().report('vehicle-history-card', reportQueries['vehicle-history-card'].parse({ branchId: base.branchId, vehicleId: '22222222-2222-4222-8222-222222222222' }));
        expect(result.groups).toHaveLength(11);
        expect(result.groups.every(g => g.columns?.length)).toBe(true);
        expect(result.groups.slice(1).every(g => g.pageBreak)).toBe(true);
        expect(result.exportSummary).toBe(false);
    });
    it('returns the photographed register columns and original document number without guessing cash/credit', async () => {
        const values = Object.fromEntries(taxRegisterMoneyKeys.map(k => [k, 0]));
        Object.assign(values, { taxableSpares: 100, taxableAmount: 90, taxableDiscount: 10, upstNonGovernment: 6.75, taxableSubtotal: 96.75, labourAmount: 55, labourVat: 4.13, wctAmount: 5, netTotal: 150.88 });
        const bill = { invoiceNumber: 'IMPORT-KEY', issuedDate: new Date('2026-10-01'), notes: 'Imported stored total; original flags pending', billType: null, customer: null, jobCard: { creditApprovedById: null }, vatBreakdown: [], partsTotal: 0, partsDiscountAmount: 0, labourTotal: 0, labourDiscountAmount: 0, serviceTotal: 0, subtotal: 140, vatAmount: 10.88, vatRate: 0, roundOff: 0, total: 150.88, taxRegisterSnapshot: { version: 1, source: 'LEGACY', documentNumber: '2026000973', values } };
        (prisma.invoice.findMany as jest.Mock).mockResolvedValue([bill]);
        const r = await new ReportsService().report('tax-register', reportQueries['tax-register'].parse({ ...base, layout: 'LEGACY' }));
        expect(r.groups[0].title).toBe('Unclassified billing type');
        expect(r.groups[0].columns).toHaveLength(24);
        expect(r.groups[0].columnGroups?.map(g => g.title)).toEqual(['Bill details', 'Taxable', 'Tax paid / non-taxable', 'Labour and bill total']);
        expect(r.groups[0].rows[0]).toMatchObject({ billNumber: '2026000973', taxableSpares: 100, labourAmount: 55, labourVat: 4.13, wctAmount: 5, netTotal: 150.88 });
        expect(r.totals.netTotal).toBe(150.88);
        const cash = await new ReportsService().report('tax-register', reportQueries['tax-register'].parse({ ...base, billType: 'CASH' }));
        expect(cash.totals.bills).toBe(0);
    });
    it.each(['DETAIL_ANNEXURE', 'DETAIL', 'ANNEXURE'])('reconciles M1 categories in %s mode', async view => {
        const baseBill = { invoiceNumber: 'B1', billType: 'CASH', issuedDate: new Date('2026-10-01'), customer: null, jobCard: null, partsTotal: 200, partsDiscountAmount: 20, labourTotal: 100, labourDiscountAmount: 0, serviceTotal: 10, subtotal: 310, vatAmount: 21.75, vatRate: 7.5, roundOff: 0.25, total: 312 };
        (prisma.invoice.findMany as jest.Mock).mockResolvedValue([{ ...baseBill, vatBreakdown: [
            { category: 'SPARES', rate: 7.5, saleAmount: 100, discount: 10, taxableAmount: 90, vat: 6.75 },
            { category: 'OIL', rate: 0, saleAmount: 50, discount: 5, taxableAmount: 45, vat: 0 },
            { category: 'ACCESSORIES', rate: 7.5, saleAmount: 50, discount: 5, taxableAmount: 45, vat: 3.38 },
            { category: 'LABOUR', rate: 7.5, saleAmount: 110, discount: 0, taxableAmount: 110, vat: 8.25 },
        ] }]);
        const result = await new ReportsService().report('tax-register', reportQueries['tax-register'].parse({ ...base, view, order: 'DATE' }));
        const annexure = result.groups.find(g => g.title === 'VAT annexure');
        if (view !== 'DETAIL') expect(annexure?.totals?.vat).toBe(result.totals.vat);
        else expect(annexure).toBeUndefined();
        if (view === 'ANNEXURE') expect(result.groups).toHaveLength(1);
        else expect(result.groups[0].columns).toEqual(expect.arrayContaining(['spares', 'oil', 'accessories', 'partsVat', 'serviceCharge', 'taxId']));
        expect((prisma.invoice.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([{ issuedDate: 'asc' }, { invoiceNumber: 'asc' }]);
    });
    it('returns an empty corporate report when no corporate master exists', async () => {
        (prisma.corporateGroup.findMany as jest.Mock).mockResolvedValue([]);
        const result = await new ReportsService().report('corporate-bills', reportQueries['corporate-bills'].parse(base));
        expect(result.groups).toEqual([]);
        expect(result.totals.billAmount).toBe(0);
    });
    it('reports a standalone estimate shortage with catalogue codes rather than UUIDs', async () => {
        (prisma.estimate.findMany as jest.Mock).mockResolvedValue([{ id: 'e', estimateNumber: 'E1', estimateDate: new Date('2026-10-01'), jobCard: null, vehicle: null, customer: null, lines: [{ type: 'PART', referenceId: 'part', description: 'Filter', quantity: 1, amount: 100 }] }]);
        (prisma.sparePart.findMany as jest.Mock).mockResolvedValue([{ id: 'part', partNumber: 'FILTER-01' }]);
        (prisma.labourItem.findMany as jest.Mock).mockResolvedValue([]);
        const r = await new ReportsService().report('estimate-vs-job', reportQueries['estimate-vs-job'].parse(base));
        expect(r.rows[0]).toMatchObject({ itemCode: 'FILTER-01', estimatedAmount: 100, actualAmount: 0, variationAmount: -100 });
    });
    it('defaults cancelled and PDI exclusion in all job-backed reports', () => { expect(jobScope(base)).toMatchObject({ branchId: base.branchId, status: { notIn: expect.arrayContaining(['CANCELLED']) }, AND: expect.any(Array) }); expect(jobScope({ ...base, includePdi: 'true' })).not.toHaveProperty('AND'); });
    it('excludes billed quantities once across duplicate parts and includes a cancelled invoice replacement correctly', async () => { (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...job, invoices: [{ lines: [{ type: 'PART', partId: 'p', quantity: 2, customerPaid: true, jobCardLineId: null }] }], lines: [1, 2].map(n => ({ id: 'l' + n, kind: 'PART', sparePartId: 'p', sparePart: { partNumber: 'P', taxCategory: 'A' }, quantity: 2, rate: 100, chargeType: 'CUSTOMER', createdAt: new Date('2026-10-01'), partIssuance: null })) }]); const r = await new ReportsService().report('unbilled-parts', reportQueries['unbilled-parts'].parse(base)); expect(r.rows).toHaveLength(1); expect(r.totals).toMatchObject({ netQty: 2, amount: 200 }); expect((prisma.jobCard.findMany as jest.Mock).mock.calls[0][0].include.invoices.where).toMatchObject({ cancelledAt: null }); });
    it('does not consume direct invoice linkage from another issuance', async () => { (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...job, invoices: [{ lines: [{ type: 'PART', partId: 'p', quantity: 2, customerPaid: true, jobCardLineId: 'l2' }] }], lines: [1, 2].map(n => ({ id: 'l' + n, kind: 'PART', sparePartId: 'p', sparePart: { partNumber: 'P', taxCategory: 'A' }, quantity: 2, rate: 100, chargeType: 'CUSTOMER', createdAt: new Date('2026-10-01'), partIssuance: null })) }]); const r = await new ReportsService().report('unbilled-parts', reportQueries['unbilled-parts'].parse(base)); expect(r.rows[0].quantityBilled).toBe(0); expect(r.totals.amount).toBe(200); });
    it('uses free-text appointment status only for cancellation, with grace and walk-ins', async () => { (prisma.serviceAppointment.findMany as jest.Mock).mockResolvedValue([{ id: 'b', vehicleId: 'v', scheduledAt: new Date('2026-10-01'), vehicle: job.vehicle, customer: null, serviceType: { description: 'Paid', code: 'PAID' }, service: null }]); (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...job, appointmentId: 'b', createdAt: new Date('2026-10-03') }, { ...job, id: 'walk', vehicleId: 'other', appointmentId: null }]); const r = await new ReportsService().report('booked-vs-availed', reportQueries['booked-vs-availed'].parse({ ...base, graceDays: 2 })); expect(r.totals).toMatchObject({ bookings: 1, availed: 1, notAvailed: 0, walkIns: 1 }); });
    it('filters warranty claims and requires an active invoice for billed-only', async () => { const l = { kind: 'PART', chargeType: 'WARRANTY', createdAt: new Date('2026-10-01'), sparePart: { partNumber: 'P', taxCategory: 'B' }, description: 'Oil', quantity: 1, rate: 50, partIssuance: null, warrantyCaseLines: [{ case: { caseNumber: 'C1', manufacturerClaimNo: 'M1', status: 'SUBMITTED', statusHistory: [] } }] }; (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([{ ...job, lines: [l], invoices: [{ id: 'bill' }] }]); const r = await new ReportsService().report('warranty-parts', reportQueries['warranty-parts'].parse({ ...base, claims: 'GENERATED', billedOnly: 'true' })); expect(r.totals.amount).toBe(50); expect((await new ReportsService().report('warranty-parts', reportQueries['warranty-parts'].parse({ ...base, claims: 'NOT_GENERATED' }))).rows).toHaveLength(0); });
    it('reconciles legacy VAT without inventing category amounts', async () => { (prisma.invoice.findMany as jest.Mock).mockResolvedValue([{ invoiceNumber: 'B1', issuedDate: new Date('2026-10-01'), customer: null, jobCard: { creditApprovedById: null }, vatBreakdown: [], partsTotal: 100, partsDiscountAmount: 0, labourTotal: 100, labourDiscountAmount: 0, serviceTotal: 0, subtotal: 200, vatAmount: 7.5, vatRate: 7.5, roundOff: 0.5, total: 208 }]); const r = await new ReportsService().report('tax-register', reportQueries['tax-register'].parse(base)); expect(r.totals.vat).toBe(7.5); expect(r.groups.find(g => g.title === 'VAT annexure')?.totals?.vat).toBe(7.5); expect(r.groups[0].rows[0].spares).toBeNull(); expect(r.warnings).toEqual(expect.arrayContaining([expect.stringContaining('historical bills')])); });
    it('groups corporate bills by vehicle membership', async () => { (prisma.corporateGroup.findMany as jest.Mock).mockResolvedValue([{ id: 'g', code: 'G', name: 'Fleet' }]); (prisma.invoice.findMany as jest.Mock).mockResolvedValue([{ invoiceNumber: 'B', issuedDate: new Date('2026-10-01'), total: 100, partsTotal: 100, labourTotal: 0, serviceTotal: 0, vatAmount: 0, outstandingAmount: 100, jobCard: { ...job, vehicle: { ...job.vehicle, corporateGroup: { code: 'G', name: 'Fleet' } } } }]); const r = await new ReportsService().report('corporate-bills', reportQueries['corporate-bills'].parse(base)); expect(r.groups[0].title).toBe('G · Fleet'); expect(r.totals.billAmount).toBe(100); });
    it('history options omit optional sections and branch scopes every nested visit', async () => { (prisma.vehicle.findMany as jest.Mock).mockResolvedValue([{ ...job.vehicle, ownerships: [], vehicleModel: null, saleDate: null, jobCards: [job], _count: { jobCards: 1 } }]); const r = await new ReportsService().report('vehicle-history-card', reportQueries['vehicle-history-card'].parse({ branchId: base.branchId, vehicleId: '22222222-2222-4222-8222-222222222222', parts: 'false', labour: 'false', demands: 'false' })); expect(r.groups.map(g => g.title)).not.toContain('Parts and oil'); expect(r.groups.map(g => g.title)).not.toContain('Labour and service charges'); expect(r.groups.map(g => g.title)).not.toContain('Customer requests'); expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].include.jobCards.where.branchId).toBe(base.branchId); });
});
