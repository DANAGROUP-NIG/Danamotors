import { ReportRow } from './report.types';
import { totals } from './report.logic';

interface Delivery { deliveryDate: string; code: string | null; description: string; free: boolean }
// Explicit service-master defaults from #72; unknown/custom services remain Others.
export function serviceDeliveryGrid(deliveries: Delivery[]) {
    const columns = ['deliveryDate', 'freeService', 'paidService', 'runningRepair', 'others', 'total', 'accidental'];
    const columnLabels = { deliveryDate: 'Date / service', freeService: 'Free service', paidService: 'Paid service', runningRepair: 'Running repair', others: 'Others', total: 'Total', accidental: 'Accidental' };
    const rows: ReportRow[] = [], freeRows: ReportRow[] = [];
    const unspecified = deliveries.some(d => d.free && !['1F', '2F', '3F'].includes(d.code?.toUpperCase() ?? ''));
    for (const date of [...new Set(deliveries.map(d => d.deliveryDate))].sort()) {
        const daily = deliveries.filter(d => d.deliveryDate === date);
        const row: ReportRow = { deliveryDate: date, freeService: 0, paidService: 0, runningRepair: 0, others: 0, total: 0, accidental: 0 };
        const free: ReportRow = { deliveryDate: date, firstService: 0, secondService: 0, thirdService: 0, ...(unspecified ? { unspecified: 0 } : {}), total: 0 };
        for (const d of daily) {
            const code = d.code?.toUpperCase(), description = d.description.trim().toUpperCase();
            const bucket = d.free ? 'freeService' : code === 'AC' || description === 'ACCIDENTAL REPAIR' ? 'accidental' : code === 'RG' || description === 'PAID SERVICE' ? 'paidService' : code === 'RR' || description === 'RUNNING REPAIR' ? 'runningRepair' : 'others';
            row[bucket] = Number(row[bucket]) + 1;
            // The reference places accidental deliveries outside its Total column.
            if (bucket !== 'accidental') row.total = Number(row.total) + 1;
            if (d.free) {
                const key = code === '1F' ? 'firstService' : code === '2F' ? 'secondService' : code === '3F' ? 'thirdService' : 'unspecified';
                free[key] = Number(free[key] ?? 0) + 1;
                free.total = Number(free.total) + 1;
            }
        }
        rows.push(row); freeRows.push(free);
    }
    const freeColumns = ['deliveryDate', 'firstService', 'secondService', 'thirdService', ...(unspecified ? ['unspecified'] : []), 'total'];
    return { rows, columns, columnLabels, totals: { ...totals(rows, columns.slice(1)), delivered: deliveries.length }, groups: [{ title: 'Break-up of free service', rows: freeRows, columns: freeColumns, columnLabels: { deliveryDate: 'Date / service', firstService: '1FS', secondService: '2FS', thirdService: '3FS', unspecified: 'Unspecified', total: 'Total' }, totals: totals(freeRows, freeColumns.slice(1)) }] };
}
