const dbUrl = process.env.TEST_DATABASE_URL;
if (dbUrl)
    process.env.DATABASE_URL = dbUrl;
import prisma from '../../prisma/client';
import { createMonthlyReportFixture } from './monthly-reports.fixture';
import { ReportsService } from './reports.service';
import { reportQueries } from './report.validation';
import { vehicleOptions, vehicleOptionsQuery } from './vehicle-options';
const integration = dbUrl ? describe : describe.skip;
integration('Monthly reports database chain', () => {
    it('reconciles booking → job → estimate → returned/customer/warranty parts → bill → delivery', async () => {
        const prefix = 'T79' + Date.now();
        let branchId: string | undefined;
        try {
            const f = await createMonthlyReportFixture(prisma, prefix);
            branchId = f.branch.id;
            const base = { branchId, from: '2026-10-01', to: '2026-10-07' };
            const reports = new ReportsService();
            const tax = await reports.report('tax-register', reportQueries['tax-register'].parse(base));
            expect(tax.totals.vat).toBe(30);
            expect(tax.totals.billAmount).toBe(791);
            expect(tax.groups.find(g => g.title === 'VAT annexure')?.totals?.vat).toBe(tax.totals.vat);
            const cash = await reports.report('tax-register', reportQueries['tax-register'].parse({ ...base, billType: 'CASH' }));
            const credit = await reports.report('tax-register', reportQueries['tax-register'].parse({ ...base, billType: 'CREDIT' }));
            expect(cash.totals).toMatchObject({ bills: 1, billAmount: 683, vat: 22.5 });
            expect(credit.totals).toMatchObject({ bills: 1, billAmount: 108, vat: 7.5 });
            const booked = await reports.report('booked-vs-availed', reportQueries['booked-vs-availed'].parse({ ...base, graceDays: 2 }));
            expect(booked.totals).toMatchObject({ bookings: 3, availed: 2, notAvailed: 1, walkIns: 2 });
            const estimate = await reports.report('estimate-vs-job', reportQueries['estimate-vs-job'].parse(base));
            expect(estimate.totals.variationAmount).toBe(-300);
            const unbilled = await reports.report('unbilled-parts', reportQueries['unbilled-parts'].parse(base));
            expect(unbilled.totals.amount).toBe(50);
            expect(unbilled.rows[0].chargeType).toBe('WARRANTY');
            const deliveries = await reports.report('delivered-model', reportQueries['delivered-model'].parse(base));
            expect(deliveries.totals.total).toBe(4);
            expect(deliveries.rows.reduce((s, r) => s + Number(r.total), 0)).toBe(4);
            const coverage = await reports.report('warranty-attended', reportQueries['warranty-attended'].parse(base));
            expect(coverage.totals).toMatchObject({ under: 2, beyond: 2, unknown: 0 });
            expect(coverage.rows.find(r => r.jobNumber === f.jobs[2].jobNumber)?.source).toBe('calculated');
            const parts = await reports.report('warranty-parts', reportQueries['warranty-parts'].parse({ ...base, claims: 'GENERATED', billedOnly: 'true' }));
            expect(parts.totals.amount).toBe(50);
            expect(parts.groups.flatMap(g => g.rows)).toHaveLength(1);
            const card = await reports.report('vehicle-history-card', reportQueries['vehicle-history-card'].parse({ branchId, vehicleId: f.vehicle.id }));
            expect(card.totals.visits).toBe(1);
            expect(card.groups).toHaveLength(11);
            expect((await reports.report('delivered-service', reportQueries['delivered-service'].parse(base))).totals.total).toBe(4);
            expect(card.groups.map(g => g.title)).toContain('Parts and oil');
            expect(card.groups.flatMap(g => g.rows).some(r => r.jobNumber === prefix + '-PDI')).toBe(false);
            const corporate = await reports.report('corporate-bills', reportQueries['corporate-bills'].parse(base));
            expect(corporate.totals.billAmount).toBe(683);
            expect(corporate.groups[0].title).toContain(f.group.code);
            const other = await prisma.branch.create({ data: { name: prefix + ' other' } });
            try {
                expect((await reports.report('delivered-model', reportQueries['delivered-model'].parse({ ...base, branchId: other.id }))).totals.total).toBe(0);
                await prisma.vehicle.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ vin: prefix + '-PICKER-' + String(index).padStart(4, '0'), customerId: f.customer.id, customMake: 'QA', customModel: 'Picker' })) });
                const found = await vehicleOptions(vehicleOptionsQuery.parse({ branchId, q: prefix + '-PICKER-1000' }));
                expect(found.vehicles).toHaveLength(1);
                const first = await vehicleOptions(vehicleOptionsQuery.parse({ branchId, q: prefix + '-PICKER-', limit: 100 }));
                const next = await vehicleOptions(vehicleOptionsQuery.parse({ branchId, q: prefix + '-PICKER-', limit: 100, cursor: first.nextCursor }));
                expect(first.vehicles).toHaveLength(100);
                expect(next.vehicles).toHaveLength(100);
                expect(new Set([...first.vehicles, ...next.vehicles].map(v => v.id)).size).toBe(200);
                const denied = await vehicleOptions(vehicleOptionsQuery.parse({ branchId: other.id, q: prefix, selectedIds: found.vehicles[0].id }));
                expect(denied.vehicles).toEqual([]);
                expect(denied.selected).toEqual([]);
            }
            finally {
                await prisma.branch.delete({ where: { id: other.id } });
            }
        }
        finally {
            // Delete only this unique test namespace; never truncate shared tables.
            const branches = await prisma.branch.findMany({ where: { name: { equals: prefix + ' QA' } }, select: { id: true } });
            branchId ??= branches[0]?.id;
            if (branchId) {
                await prisma.warrantyCase.deleteMany({ where: { branchId } });
                await prisma.invoice.deleteMany({ where: { jobCard: { branchId } } });
                await prisma.estimate.deleteMany({ where: { OR: [{ branchId }, { jobCard: { branchId } }] } });
                await prisma.jobCardLine.deleteMany({ where: { jobCard: { branchId } } });
                await prisma.jobCardLabour.deleteMany({ where: { jobCard: { branchId } } });
                await prisma.partReturn.deleteMany({ where: { partIssuance: { branchId } } });
                await prisma.partIssuance.deleteMany({ where: { branchId } });
                await prisma.jobCard.deleteMany({ where: { branchId } });
                await prisma.serviceAppointment.deleteMany({ where: { branchId } });
                await prisma.vehicle.deleteMany({ where: { vin: { startsWith: prefix } } });
                await prisma.customer.deleteMany({ where: { branchId } });
                await prisma.user.deleteMany({ where: { branchId } });
                await prisma.branch.delete({ where: { id: branchId } });
            }
            await prisma.corporateGroup.deleteMany({ where: { code: { startsWith: prefix } } });
            await prisma.sparePart.deleteMany({ where: { partNumber: { startsWith: prefix } } });
            await prisma.labourItem.deleteMany({ where: { code: { startsWith: prefix } } });
            await prisma.workshopMaster.deleteMany({ where: { code: { startsWith: prefix }, kind: 'VARIANT' } });
            await prisma.workshopMaster.deleteMany({ where: { code: { startsWith: prefix } } });
            await prisma.vehicleModel.deleteMany({ where: { code: { startsWith: prefix } } });
            await prisma.role.deleteMany({ where: { name: prefix + 'NoReports' } });
        }
    }, 120000);
    afterAll(async () => prisma.$disconnect());
});
