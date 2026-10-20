import { actualLineAmount, allocateUnbilled, availedJob, bookingSummary, compareEstimate } from './report.logic';
import { matchesModel, warrantyRow } from './delivery-warranty.report';
import { ReportJob } from './report.repository';

describe('monthly report calculation regressions', () => {
    it('prioritises an explicitly linked booking job over an earlier same-vehicle visit', () => {
        const booking = { id: 'booking', vehicleId: 'vehicle', scheduledAt: new Date('2026-10-01T09:00Z') };
        const jobs = [{ id: 'walk', vehicleId: 'vehicle', appointmentId: null, createdAt: new Date('2026-10-01T10:00Z') }, { id: 'linked', vehicleId: 'vehicle', appointmentId: 'booking', createdAt: new Date('2026-10-03T10:00Z') }];
        expect(availedJob(booking, jobs, 2)?.id).toBe('linked');
        expect(availedJob(booking, jobs, 0)?.id).toBe('walk');
        expect(availedJob(booking, [{ ...jobs[0], createdAt: new Date('2026-09-30T10:00Z') }], 2)).toBeUndefined();
        expect(bookingSummary([{ section: 'Booked and availed' }, { section: 'Booked but not availed' }, { section: 'Walk-ins' }])).toEqual({ bookings: 2, availed: 1, notAvailed: 1, availedPercent: 50, walkIns: 1 });
    });
    it('subtracts exact billed linkage for warranty/FOC lines without consuming another line', () => {
        const lines = ['a', 'b'].map(id => ({ id, sparePartId: 'part', chargeType: 'WARRANTY', quantity: 5, createdAt: new Date('2026-10-01'), partIssuance: { quantity: 5, returns: [{ quantity: 1, status: 'Completed' }] } }));
        const allocations = allocateUnbilled(lines, [{ lines: [{ type: 'PART', jobCardLineId: 'a', partId: 'part', quantity: 2, customerPaid: false }] }]);
        expect(allocations.map(l => l.netQty)).toEqual([2, 4]);
        expect(allocations[0]).toMatchObject({ issued: 5, returned: 1, billed: 2 });
    });
    it('preserves stored labour amounts and prorates returned parts using decimal arithmetic', () => {
        expect(actualLineAmount({ kind: 'LABOUR', quantity: 3, amount: 100 })).toBe(100);
        expect(actualLineAmount({ kind: 'PART', quantity: 3, amount: 100, partIssuance: { quantity: 3, returns: [{ quantity: 1, status: 'Completed' }] } })).toBe(66.67);
        expect(actualLineAmount({ kind: 'PART', quantity: 1, amount: 100, partIssuance: { quantity: 1, returns: [{ quantity: 2, status: 'Completed' }] } })).toBe(0);
    });
    it('compares labour operation quantities and stored amounts in both directions', () => {
        const line = { key: 'LABOUR:OP-1', type: 'LABOUR', code: 'OP-1', description: 'Repair', quantity: 2, amount: 100 };
        expect(compareEstimate([line], [{ ...line, quantity: 1, amount: 40 }], 'ESTIMATE', 'SHORTAGE')[0]).toMatchObject({ variationQty: -1, variationAmount: -60 });
        expect(compareEstimate([line], [{ ...line, quantity: 3, amount: 140 }], 'JOB', 'EXCESS')[0]).toMatchObject({ variationQty: 1, variationAmount: 40 });
    });
    it('matches both canonical and workshop model identities', () => {
        expect(matchesModel(['catalog'], { modelId: 'catalog' })).toBe(true);
        expect(matchesModel(['workshop'], { catalogue: { parentId: 'workshop' } })).toBe(true);
        expect(matchesModel(['other'], { modelId: 'catalog' })).toBe(false);
    });
    it.each([{ sale: '2026-01-01', mileage: 1000, warranty: 'UNDER' }, { sale: '2024-01-01', mileage: 1000, warranty: 'BEYOND' }, { sale: '2026-01-01', mileage: 100001, warranty: 'BEYOND' }])('calculates historical coverage for $warranty', ({ sale, mileage, warranty }) => {
        const job = { createdAt: new Date('2026-10-01'), mileage, warrantyStatusAtCreation: null, vehicle: { saleDate: new Date(sale), lastRecordedMileage: 999999, vehicleModel: { code: 'RIO', name: 'Rio', warrantyDays: 365, warrantyKm: 100000, warrantyCovered: true } }, customer: null, jobNumber: 'J1' } as unknown as ReportJob;
        expect(warrantyRow(job)).toMatchObject({ warranty, source: 'calculated' });
    });
});
