import { ReportSection, ReportRow } from './report.types';

type Layout = Pick<ReportSection, 'columns' | 'columnLabels' | 'columnGroups'>;
export const bookedColumns: Layout = {
    columns: ['serialNumber', 'registration', 'customer', 'model', 'variant', 'vin', 'serviceCode', 'bookedFor', 'jobDate', 'daysLate'],
    columnLabels: { serialNumber: 'S.No.', registration: 'Regn. no.', customer: 'Customer', model: 'Model', variant: 'Variant', vin: 'VIN', serviceCode: 'Service', bookedFor: 'Service booked date', jobDate: 'Service availed date', daysLate: 'Variation (days)' },
};
export const unbilledColumns: Layout = {
    columns: ['jobDate', 'jobNumber', 'registration', 'customer', 'model', 'variant', 'requisitionNumber', 'issueDate', 'chargeType', 'partNumber', 'description', 'netQty', 'rate', 'retailAmount', 'dealerRate', 'dealerAmount'],
    columnLabels: { jobDate: 'Job date', jobNumber: 'Job number', registration: 'Registration number', customer: 'Customer name', model: 'Model', variant: 'Variant', requisitionNumber: 'Requisition number', issueDate: 'Requisition date', chargeType: 'Type', partNumber: 'Part number', description: 'Part description', netQty: 'Qty', rate: 'Rate', retailAmount: 'Amount', dealerRate: 'Rate', dealerAmount: 'Amount' },
    columnGroups: [{ title: 'Job', columns: ['jobDate', 'jobNumber', 'registration', 'customer', 'model', 'variant'] }, { title: 'Requisition and part', columns: ['requisitionNumber', 'issueDate', 'chargeType', 'partNumber', 'description', 'netQty'] }, { title: 'Retail', columns: ['rate', 'retailAmount'] }, { title: 'Dealer', columns: ['dealerRate', 'dealerAmount'] }],
};
export const corporateColumns: Layout = {
    columns: ['serialNumber', 'model', 'registration', 'billNumber', 'billDate', 'billAmount'],
    columnLabels: { serialNumber: 'S.No.', model: 'Model', registration: 'Registration no.', billNumber: 'Bill no.', billDate: 'Bill date', billAmount: 'Amount' },
};
export const warrantyPartsColumns: Layout = {
    columns: ['vin', 'partNumber', 'description', 'quantity', 'dealerRate', 'dealerAmount', 'jobDate', 'manufacturerClaim', 'claimDate'],
    columnLabels: { vin: 'VIN', partNumber: 'Part no.', description: 'Part description', quantity: 'Quantity', dealerRate: 'Dealer rate', dealerAmount: 'Amount', jobDate: 'Job date', manufacturerClaim: 'Wty claim no.', claimDate: 'Wty claim date' },
};
export const numberedRows = (rows: ReportRow[]): ReportRow[] => rows.map((row, index) => ({ ...row, serialNumber: index + 1 }));
