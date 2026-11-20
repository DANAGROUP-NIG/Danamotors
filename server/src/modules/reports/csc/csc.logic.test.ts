import { buildNoShow, followUpTotals, groupByMonth, monthRange, usedReasons, type CscReportRow } from './csc.logic';

const row = (over: Partial<CscReportRow>): CscReportRow => ({
  caseId: 'c', status: 'OPEN', dueDate: '2026-11-10', dueMonth: '2026-11', modelId: 'm1', model: 'Sportage', serviceTypeId: 's-rg', serviceCode: 'RG',
  serviceDescription: 'PAID SERVICE', bookingNumber: null, closeReasonId: null, closeReasonCode: null, closeReason: null, contacts: [], ...over,
});
const contact = { stage: 'FIRST', slot: 1, date: '2026-10-27', person: 'Owner', remarks: 'ok', doneBy: null };
const SOLD = { id: 'r4', code: 'R0004', description: 'Vehicle sold' };
const NOT_WILLING = { id: 'r3', code: 'R0003', description: 'Not willing' };

describe('CSC report logic', () => {
  it('summarises generated, contacted, booked, visited, closed and open', () => {
    const rows = [
      row({ caseId: 'a', contacts: [contact], bookingNumber: 'B1', status: 'VISITED' }),
      row({ caseId: 'b', contacts: [contact], status: 'CLOSED', closeReasonId: 'r4' }),
      row({ caseId: 'c' }),
    ];
    expect(followUpTotals(rows)).toEqual({ count: 3, contacted: 2, booked: 1, visited: 1, closed: 1, open: 1 });
  });

  it('groups the follow-up report by due month', () => {
    const { groups } = groupByMonth([row({ dueMonth: '2026-11' }), row({ dueMonth: '2026-10' }), row({ dueMonth: '2026-11' })]);
    expect(groups.map((group) => [group.key, group.count])).toEqual([['2026-10', 1], ['2026-11', 2]]);
  });

  it('counts no-shows per reason, model-wise or service-wise', () => {
    const rows = [
      row({ caseId: 'a', status: 'CLOSED', closeReasonId: 'r4', closeReasonCode: 'R0004' }),
      row({ caseId: 'b', status: 'CLOSED', closeReasonId: 'r3', closeReasonCode: 'R0003', modelId: 'm2', model: 'Rio', serviceTypeId: 's-2f', serviceCode: '2F' }),
      row({ caseId: 'c', status: 'CLOSED', closeReasonId: 'r4', closeReasonCode: 'R0004', modelId: 'm2', model: 'Rio' }),
    ];
    const reasons = usedReasons(rows, [SOLD, NOT_WILLING, { id: 'r9', code: 'R0009', description: 'Unused' }]);
    expect(reasons.map((reason) => reason.code)).toEqual(['R0003', 'R0004']);
    const byModel = buildNoShow(rows, reasons, 'model');
    expect(byModel.totals).toEqual({ count: 3, reason_R0003: 1, reason_R0004: 2 });
    expect(byModel.groups.map((group) => [group.label, group.count, group.totals.reason_R0004])).toEqual([['Rio', 2, 1], ['Sportage', 1, 1]]);
    const byService = buildNoShow(rows, reasons, 'service');
    expect(byService.groups.map((group) => group.label)).toEqual(['RG · PAID SERVICE', '2F · PAID SERVICE']);
    expect(byService.rows[0].groupKey).toBe('s-rg');
  });

  it('turns a month into its first and last day, optionally from the month before', () => {
    expect(monthRange('2026-11', false)).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2026-03', true)).toEqual({ from: '2026-02-01', to: '2026-03-31' });
    expect(monthRange('2026-01', true)).toEqual({ from: '2025-12-01', to: '2026-01-31' });
  });
});
