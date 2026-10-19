import { categoryOf, claimGenerated, dateBounds, deliveryGrid, netIssued, unbilledQuantity, daysLate, compareEstimate } from './report.logic';
import { reportQueries } from './report.validation';
import { warrantyRow } from './delivery-warranty.report';
import { ReportJob } from './report.repository';
describe('Monthly report rules', () => {
    it('keeps dimension names distinct from grid totals and date fields', () => {
        const grid = deliveryGrid(['total', 'deliveryDate', '__proto__', 'dimension:total'].map(model => ({ model, deliveryDate: '2026-10-01' })), 'model');
        expect(grid.rows[0].deliveryDate).toBe('2026-10-01');
        expect(grid.totals.total).toBe(4);
        expect(grid.columns).toHaveLength(6);
        expect(grid.columnLabels['dimension:total']).toBe('total');
        expect(grid.rows[0]['dimension:dimension:total']).toBe(1);
    });
    it('counts delivered jobs with reconciling row and column totals', () => { const g = deliveryGrid([{ deliveryDate: '2026-10-01', model: 'Rio' }, { deliveryDate: '2026-10-01', model: 'Rio' }, { deliveryDate: '2026-10-02', model: 'Sportage' }], 'model'); expect(g.totals).toEqual({ Rio: 2, Sportage: 1, total: 3 }); expect(g.rows.map(r => r.total)).toEqual([2, 1]); });
    it('uses Lagos inclusive dates with exclusive next midnight', () => { expect(dateBounds('2026-10-01', '2026-10-01')).toEqual({ gte: new Date('2026-09-30T23:00Z'), lt: new Date('2026-10-01T23:00Z') }); });
    it('validates backwards, oversized and malformed dates', () => {
        for (const v of [{ from: '2026-10-02', to: '2026-10-01' }, { from: '2025-01-01', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-01' }])
            expect(reportQueries['delivered-service'].safeParse(v).success).toBe(false);
    });
    it('validates whole grace days and explicit booleans', () => { expect(reportQueries['booked-vs-availed'].safeParse({ from: '2026-10-01', to: '2026-10-02', graceDays: '1.5' }).success).toBe(false); expect(reportQueries['warranty-parts'].parse({ from: '2026-10-01', to: '2026-10-02', billedOnly: 'false' }).billedOnly).toBe('false'); });
    it('requires submission lifecycle evidence for claim generation', () => { expect(claimGenerated([{ case: { status: 'OPEN' } }])).toBe(false); expect(claimGenerated([{ case: { status: 'SUBMITTED' } }])).toBe(true); expect(claimGenerated([{ case: { status: 'CLOSED' } }])).toBe(false); expect(claimGenerated([{ case: { status: 'CLOSED', statusHistory: [{ toStatus: 'SUBMITTED' }] } }])).toBe(true); expect(claimGenerated([{ case: { status: 'OPEN', statusHistory: [{ toStatus: 'SUBMITTED' }] } }])).toBe(true); });
    it('preserves unknown categories rather than guessing', () => { expect(categoryOf({ taxCategory: 'B' })).toBe('OIL'); expect(categoryOf({ taxCategory: 'VAT' })).toBe('UNCLASSIFIED'); });
    it('uses the opening warranty snapshot and retains UNKNOWN', () => { const j = { createdAt: new Date('2026-10-01'), warrantyStatusAtCreation: 'ACTIVE', warrantyKmLimitAtCreation: 100000, warrantyExpiresOnAtCreation: new Date('2027-01-01'), vehicle: null, customer: null, jobNumber: 'J1' } as unknown as ReportJob; expect(warrantyRow(j)).toMatchObject({ warranty: 'UNDER', source: 'snapshot', kmLimit: 100000 }); expect(warrantyRow({ ...j, warrantyStatusAtCreation: 'UNKNOWN' })).toMatchObject({ warranty: 'UNKNOWN' }); });
    it('marks historical fallback calculated without using later vehicle mileage', () => { const j = { createdAt: new Date('2026-10-01'), mileage: null, vehicle: { saleDate: new Date('2026-01-01'), lastRecordedMileage: 1000, vehicleModel: { code: 'R', name: 'Rio', warrantyDays: 1825, warrantyKm: 100000, warrantyCovered: true } }, customer: null, jobNumber: 'J1' } as unknown as ReportJob; expect(warrantyRow(j)).toMatchObject({ warranty: 'UNKNOWN', source: 'calculated' }); });
    it('uses net returns and subtracts billed quantities', () => { expect(netIssued(5, [{ quantity: 1, status: 'Approved' }, { quantity: 2, status: 'REJECTED' }])).toBe(4); expect(unbilledQuantity(5, 1, 2)).toBe(2); });
    it('computes calendar grace days', () => { expect(daysLate(new Date('2026-10-01T12:00Z'), new Date('2026-10-03T08:00Z'))).toBe(2); });
    it('matches and aggregates parts and operation lines for shortage and excess', () => { const e = [{ key: 'PART:P', type: 'PART', code: 'P', description: 'Part', quantity: 3, amount: 300 }]; const a = [{ ...e[0], quantity: 1, amount: 100 }]; expect(compareEstimate(e, a, 'ESTIMATE', 'SHORTAGE')).toEqual([expect.objectContaining({ variationQty: -2, variationAmount: -200 })]); expect(compareEstimate(e, a, 'JOB', 'EXCESS')).toEqual([]); expect(compareEstimate([], a, 'JOB', 'EXCESS')[0]).toMatchObject({ variationAmount: 100 }); });
});
