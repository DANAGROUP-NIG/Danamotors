import { ChargeType, JobCardType } from '@prisma/client';
import {
  assertEditable, assertNotFrozen, assertPdiBillType, assertServiceTypeForJob, chargeTypeTotals, defectLineTotal, defectTotals,
  pdiBillLines, pdiBillSplit, pdiBillTypeOf, pdiDocumentNumber, pdiPrintTitle, pdiRegistrationFromVin, pdiRequisitionDocument, pdiSequenceKey, serviceHistoryWhere, withoutRoundOff,
} from './pdi.logic';

describe('PDI numbering', () => {
  it('uses its own sequence keys, separate from service documents', () => {
    expect(pdiSequenceKey('JOB_CARD')).toBe('PDI_JOB_CARD');
    expect(pdiSequenceKey('JOB_CARD')).not.toBe('JOB_CARD');
    expect(pdiSequenceKey('BILL')).toBe('PDI_BILL');
    expect(pdiSequenceKey('REQUISITION', 'b1')).toBe('PDI_REQUISITION_b1');
    expect(pdiSequenceKey('REQUISITION', 'b1')).not.toBe('REQUISITION_b1');
    expect(pdiSequenceKey('RETURN', 'b1')).toBe('PDI_RETURN_b1');
    expect(pdiSequenceKey('LABOUR_SLIP', 'b1')).toBe('PDI_LABOUR_SLIP_b1');
  });

  it('gives warranty requisitions their own series and prefix', () => {
    expect(pdiRequisitionDocument(ChargeType.WARRANTY)).toBe('WARRANTY_REQUISITION');
    expect(pdiRequisitionDocument(ChargeType.CUSTOMER)).toBe('REQUISITION');
    expect(pdiRequisitionDocument(ChargeType.GOODWILL)).toBe('REQUISITION');
    expect(pdiSequenceKey('WARRANTY_REQUISITION', 'b1')).toBe('PDI_WARRANTY_REQUISITION_b1');
    expect(pdiDocumentNumber('WARRANTY_REQUISITION', '2026000001')).toBe('PW2026000001');
  });

  it('prefixes the YYYY###### serial so PDI numbers never equal a service number', () => {
    expect(pdiDocumentNumber('JOB_CARD', '2026000001')).toBe('P2026000001');
    expect(pdiDocumentNumber('BILL', '2026000042')).toBe('P2026000042');
    expect(() => pdiDocumentNumber('JOB_CARD', '26-1')).toThrow();
  });

  it('needs a branch for per-branch series', () => {
    expect(() => pdiSequenceKey('REQUISITION')).toThrow('branch');
  });
});

describe('PDI registration', () => {
  it('defaults to the last 6 characters of the VIN', () => {
    expect(pdiRegistrationFromVin('knadn512bm6123456')).toBe('123456');
    expect(pdiRegistrationFromVin(' KNA-DN512 BM6ABC12 ')).toBe('6ABC12');
  });
  it('keeps a short VIN whole and rejects a blank one', () => {
    expect(pdiRegistrationFromVin('AB12')).toBe('AB12');
    expect(() => pdiRegistrationFromVin(' - ')).toThrow('VIN');
  });
});

describe('defect lines', () => {
  it('totals parts, oil and labour per line in decimal money', () => {
    expect(defectLineTotal({ spare: 0.1, oil: 0.2, labour: 0 })).toBe(0.3);
    expect(defectLineTotal({ spare: 1500.55, oil: null, labour: 2000 })).toBe(3500.55);
  });
  it('totals the grid by column', () => {
    expect(defectTotals([{ spare: 100, oil: 20, labour: 30 }, { spare: 0.05, labour: 0.05 }])).toEqual({ spare: 100.05, oil: 20, labour: 30.05, total: 150.1 });
    expect(defectTotals([])).toEqual({ spare: 0, oil: 0, labour: 0, total: 0 });
  });
});

describe('service type by job type', () => {
  const pdi = { preDelivery: true };
  const byCategory = { preDelivery: false, category: 'pdi' };
  const paid = { preDelivery: false, category: 'PAID' };
  it('rejects PDI service types on a service job card', () => {
    expect(() => assertServiceTypeForJob(JobCardType.SERVICE, pdi)).toThrow('PDI menu');
    expect(() => assertServiceTypeForJob(JobCardType.SERVICE, byCategory)).toThrow('PDI menu');
    expect(() => assertServiceTypeForJob(JobCardType.SERVICE, paid)).not.toThrow();
  });
  it('accepts only PDI service types on a PDI job card', () => {
    expect(() => assertServiceTypeForJob(JobCardType.PDI, pdi)).not.toThrow();
    expect(() => assertServiceTypeForJob(JobCardType.PDI, byCategory)).not.toThrow();
    expect(() => assertServiceTypeForJob(JobCardType.PDI, paid)).toThrow('PDI service type');
  });
});

describe('labour totals by charge type', () => {
  it('splits warranty, non-warranty, FOC and goodwill', () => {
    expect(chargeTypeTotals([
      { chargeType: ChargeType.WARRANTY, amount: 1000 },
      { chargeType: ChargeType.CUSTOMER, amount: 250.5 },
      { chargeType: ChargeType.CUSTOMER, amount: 0.25 },
      { chargeType: ChargeType.FREE, amount: 300 },
      { chargeType: ChargeType.GOODWILL, amount: 50 },
    ])).toEqual({ warranty: 1000, nonWarranty: 250.75, foc: 300, goodwill: 50, total: 1600.75 });
  });
});

describe('PDI bill type', () => {
  it('allows ZERO only when nothing is chargeable', () => {
    expect(assertPdiBillType('ZERO', 0)).toEqual({ storedBillType: 'ZERO' });
    expect(() => assertPdiBillType('ZERO', 0.01)).toThrow('zero bill');
  });
  it('needs a chargeable amount for cash and invoice bills', () => {
    expect(() => assertPdiBillType('CASH', 0)).toThrow('zero bill');
    expect(assertPdiBillType('CASH', 10)).toEqual({ storedBillType: 'CASH' });
  });
  it('stores INVOICE as a credit bill and needs a credit company', () => {
    expect(() => assertPdiBillType('INVOICE', 10)).toThrow('credit company');
    expect(assertPdiBillType('INVOICE', 10, { creditCompany: 'Fleet Ltd' })).toEqual({ storedBillType: 'CREDIT' });
    expect(pdiBillTypeOf('CREDIT')).toBe('INVOICE');
    expect(pdiBillTypeOf('ZERO')).toBe('ZERO');
    expect(pdiBillTypeOf('CASH')).toBe('CASH');
  });
  it('prints PDI INVOICE or PDI CASH MEMO from settings', () => {
    const titles = { invoiceTitle: 'PDI INVOICE', cashMemoTitle: 'PDI CASH MEMO' };
    expect(pdiPrintTitle('INVOICE', titles)).toBe('PDI INVOICE');
    expect(pdiPrintTitle('CASH', titles)).toBe('PDI CASH MEMO');
    expect(pdiPrintTitle('ZERO', titles)).toBe('PDI CASH MEMO');
  });
});

describe('freeze dates and print rules', () => {
  it('blocks documents dated on or before the freeze date (Lagos day)', () => {
    const freeze = new Date('2026-11-10T00:00:00Z');
    expect(() => assertNotFrozen('job', freeze, new Date('2026-11-10T22:30:00Z'))).toThrow('frozen');
    // 23:30 UTC on the 10th is already the 11th in Lagos.
    expect(() => assertNotFrozen('job', freeze, new Date('2026-11-10T23:30:00Z'))).not.toThrow();
    expect(() => assertNotFrozen('bill', null, new Date('2020-01-01'))).not.toThrow();
  });
  it('applies the before and after print rules', () => {
    const rules = { beforePrint: true, afterPrint: false };
    expect(() => assertEditable('requisition', null, rules)).not.toThrow();
    expect(() => assertEditable('requisition', new Date(), rules)).toThrow('after it has been printed');
    expect(() => assertEditable('job', null, { beforePrint: false, afterPrint: true })).toThrow('before it is printed');
  });
});

describe('service history filter', () => {
  it('excludes PDI jobs and PDI service types by default', () => {
    const where = serviceHistoryWhere();
    expect(where.jobType).toBe(JobCardType.SERVICE);
    expect(JSON.stringify(where)).toContain('"preDelivery":false');
    expect(JSON.stringify(where)).toContain('"category":null');
  });
  it('includes everything when the setting is on', () => {
    expect(serviceHistoryWhere(true)).toEqual({});
  });
});

describe('PDI bill lines', () => {
  const lines = pdiBillLines([
    { type: 'PART', chargeType: ChargeType.CUSTOMER, description: 'Bulb', quantity: 2, rate: 500, amount: 1000 },
    { type: 'PART', chargeType: ChargeType.WARRANTY, description: 'Wiper', quantity: 1, rate: 800, amount: 800 },
    { type: 'PART', chargeType: ChargeType.CUSTOMER, description: 'Returned', quantity: 0, rate: 900, amount: 0 },
    { type: 'LABOUR', chargeType: ChargeType.FREE, description: 'Inspection', quantity: 1, rate: 3000, amount: 3000 },
    { type: 'LABOUR', chargeType: ChargeType.CUSTOMER, description: 'Polish', quantity: 1.5, rate: 1000, amount: 1500 },
    { type: 'SERVICE', chargeType: ChargeType.CUSTOMER, description: 'PDI charge', quantity: 1, rate: 5000, amount: 5000, companyPaid: true },
  ]);
  it('drops fully returned lines and marks only non-warranty charges chargeable', () => {
    expect(lines.map(line => [line.description, line.chargeable])).toEqual([['Bulb', true], ['Wiper', false], ['Inspection', false], ['Polish', true], ['PDI charge', false]]);
  });
  it('splits chargeable parts, labour and service from the rest', () => {
    expect(pdiBillSplit(lines)).toEqual({ partsTotal: 1000, labourTotal: 1500, serviceTotal: 0, chargeableTotal: 2500, nonChargeableTotal: 8800 });
  });
  it('is zero when everything is warranty or FOC', () => {
    expect(pdiBillSplit(pdiBillLines([{ type: 'PART', chargeType: ChargeType.FREE, description: 'x', quantity: 1, rate: 1, amount: 1 }])).chargeableTotal).toBe(0);
  });
  it('removes the round-off when PDI bills are not rounded', () => {
    expect(withoutRoundOff({ total: 2690, roundOff: -2.5 }, false)).toEqual({ total: 2692.5, roundOff: 0 });
    expect(withoutRoundOff({ total: 2690, roundOff: -2.5 }, true)).toEqual({ total: 2690, roundOff: -2.5 });
  });
});
