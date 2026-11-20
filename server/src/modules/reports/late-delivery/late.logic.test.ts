import { discrepancySections, groupLines, lateTotals, NO_REASON_LABEL, reasonLines, type DeliveredCount, type LateReportRow, type ReasonMaster } from './late.logic';

const reasons: ReasonMaster[] = [
  { id: 'r1', code: '1', description: 'Engineer absent', active: true },
  { id: 'r2', code: '2', description: 'Spare unavailable', active: true },
  { id: 'old', code: 'PARTS', description: 'Awaiting parts', active: false },
];
const ref = (id: string) => reasons.find((reason) => reason.id === id)!;

let seq = 0;
function late(overrides: Partial<LateReportRow> = {}): LateReportRow {
  seq += 1;
  return { jobId: `j${seq}`, jobNumber: `J${seq}`, model: 'Rio', serviceType: 'Paid service', lateKind: 'DATE', daysLate: 1, minutesLate: 600, reasons: [], ...overrides };
}

const delivered: DeliveredCount[] = [
  { model: 'Rio', serviceType: 'Paid service', delivered: 6 },
  { model: 'Rio', serviceType: 'Free service', delivered: 2 },
  { model: null, serviceType: 'Paid service', delivered: 2 },
];

describe('lateTotals', () => {
  it('gives delivered, late, late % and average days late', () => {
    const rows = [late({ daysLate: 1 }), late({ daysLate: 4 })];
    expect(lateTotals(rows, delivered, 'DATE')).toEqual({ count: 2, delivered: 10, late: 2, latePct: 20, avgLate: 2.5 });
  });

  it('averages minutes for time reports and is zero-safe', () => {
    expect(lateTotals([late({ lateKind: 'TIME', minutesLate: 30 }), late({ lateKind: 'TIME', minutesLate: 45 })], delivered, 'TIME').avgLate).toBe(37.5);
    expect(lateTotals([], [], 'DATE')).toEqual({ count: 0, delivered: 0, late: 0, latePct: 0, avgLate: 0 });
  });
});

describe('groupLines', () => {
  it('puts blank models under "Model not set" in both counts and rows, most late first', () => {
    const rows = [late({ model: '' }), late({ model: '' }), late()];
    const lines = groupLines(rows, delivered, 'model', 'DATE');
    expect(lines.map((line) => [line.label, line.delivered, line.late, line.latePct])).toEqual([
      ['Model not set', 2, 2, 100],
      ['Rio', 8, 1, 12.5],
    ]);
  });

  it('lists service types with no late job at 0%', () => {
    const lines = groupLines([late()], delivered, 'serviceType', 'DATE');
    expect(lines.find((line) => line.label === 'Free service')).toMatchObject({ delivered: 2, late: 0, latePct: 0, avgLate: 0 });
  });
});

describe('reasonLines', () => {
  it('counts a job under each reason, adds "No reason recorded", hides unused retired reasons', () => {
    const rows = [late({ reasons: [ref('r1'), ref('r2')], daysLate: 2 }), late({ reasons: [ref('r2')], daysLate: 4 }), late()];
    const lines = reasonLines(rows, reasons, 'DATE');
    expect(lines.map((line) => [line.label, line.late, line.lateShare, line.avgLate])).toEqual([
      ['Engineer absent', 1, 33.33, 2],
      ['Spare unavailable', 2, 66.67, 3],
      [NO_REASON_LABEL, 1, 33.33, 1],
    ]);
  });

  it('shows a retired reason while jobs in the period use it', () => {
    const lines = reasonLines([late({ reasons: [ref('old')] })], reasons, 'DATE');
    expect(lines.map((line) => line.code)).toEqual(['1', '2', 'PARTS', '']);
  });
});

describe('discrepancySections', () => {
  it('builds model, service type and reason tables whose totals match the report totals', () => {
    const rows = [late({ reasons: [ref('r2')] }), late({ model: 'Sportage', daysLate: 3 })];
    const sections = discrepancySections(rows, [...delivered, { model: 'Sportage', serviceType: 'Paid service', delivered: 1 }], reasons, 'DATE');
    expect(sections.map((section) => section.key)).toEqual(['model', 'serviceType', 'reason']);
    expect(sections[0].total).toMatchObject({ delivered: 11, late: 2, avgLate: 2 });
    expect(sections[2].rows.map((row) => row.label)).toEqual(['1 Engineer absent', '2 Spare unavailable', NO_REASON_LABEL]);
    const modelLate = sections[0].rows.reduce((sum, row) => sum + Number(row.late), 0);
    expect(modelLate).toBe(2);
  });
});
