import { bookedColumns, corporateColumns, unbilledColumns, warrantyPartsColumns } from './legacy-columns';
import { serviceDeliveryGrid } from './service-delivery-grid';
import { reportQueries } from './report.validation';

describe('Photographed legacy report contracts', () => {
    it('defaults tax register to the photographed charge breakdown', () => {
        expect(reportQueries['tax-register'].parse({ from: '2026-07-01', to: '2026-07-04' }).layout).toBe('LEGACY');
    });
    it('defines explicit column orders so hidden implementation fields cannot leak into print or Excel', () => {
        expect(bookedColumns.columns).toEqual(['serialNumber', 'registration', 'customer', 'model', 'variant', 'vin', 'serviceCode', 'bookedFor', 'jobDate', 'daysLate']);
        expect(corporateColumns.columns).toEqual(['serialNumber', 'model', 'registration', 'billNumber', 'billDate', 'billAmount']);
        expect(warrantyPartsColumns.columns).toEqual(['vin', 'partNumber', 'description', 'quantity', 'dealerRate', 'dealerAmount', 'jobDate', 'manufacturerClaim', 'claimDate']);
        expect(unbilledColumns.columnGroups?.flatMap(g => g.columns)).toEqual(unbilledColumns.columns);
    });
    it('separates accidental deliveries from the reference Total while preserving the all-delivery count', () => {
        const result = serviceDeliveryGrid(['1F', '2F', '3F', 'RG', 'RR', 'AC', 'CUSTOM'].map(code => ({ deliveryDate: '2026-07-01', code, free: ['1F', '2F', '3F'].includes(code), description: code })));
        expect(result.rows[0]).toMatchObject({ freeService: 3, paidService: 1, runningRepair: 1, others: 1, total: 6, accidental: 1 });
        expect(result.totals).toMatchObject({ total: 6, accidental: 1, delivered: 7 });
        expect(result.groups[0].totals).toEqual({ firstService: 1, secondService: 1, thirdService: 1, total: 3 });
    });
    it('does not invent a free-service sequence for imported or custom free services', () => {
        const result = serviceDeliveryGrid([{ deliveryDate: '2026-07-01', code: 'FREE', description: 'Free service', free: true }]);
        expect(result.groups[0].rows[0]).toMatchObject({ firstService: 0, secondService: 0, thirdService: 0, unspecified: 1, total: 1 });
    });
});
