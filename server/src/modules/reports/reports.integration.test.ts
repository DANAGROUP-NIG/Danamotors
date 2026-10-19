const dbUrl = process.env.TEST_DATABASE_URL;
if (dbUrl)
    process.env.DATABASE_URL = dbUrl;
import prisma from '../../prisma/client';
import { createMonthlyReportFixture } from './monthly-reports.fixture';
import { ReportsService } from './reports.service';
import { reportQueries } from './report.validation';
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
            expect(parts.rows).toHaveLength(1);
            const card = await reports.report('vehicle-history-card', reportQueries['vehicle-history-card'].parse({ branchId, vehicleId: f.vehicle.id }));
            expect(card.totals.visits).toBe(1);
            expect(card.groups.map(g => g.title)).toContain('Parts and oil');
            expect(card.groups.flatMap(g => g.rows).some(r => r.jobNumber === prefix + '-PDI')).toBe(false);
            const corporate = await reports.report('corporate-bills', reportQueries['corporate-bills'].parse(base));
            expect(corporate.totals.billAmount).toBe(683);
            expect(corporate.groups[0].title).toContain(f.group.code);
            const other = await prisma.branch.create({ data: { name: prefix + ' other' } });
            try {
                expect((await reports.report('delivered-model', reportQueries['delivered-model'].parse({ ...base, branchId: other.id }))).totals.total).toBe(0);
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
