import { remarksChange, assertDocumentBranch, projectPickingLines } from './service-document.logic';
import { serviceRemarksSchema } from './service-document.validation';

it('normalizes empty remarks to null and distinguishes no-op edits', () => {
  expect(remarksChange('Previous', '  Replacement  ')).toEqual({ oldValue: 'Previous', newValue: 'Replacement', changed: true });
  expect(remarksChange(null, '  ')).toEqual({ oldValue: null, newValue: null, changed: false });
  expect(remarksChange('Previous', null).changed).toBe(true);
});
it('allows only a remarks field and caps its length', () => {
  const body = serviceRemarksSchema.shape.body;
  expect(body.safeParse({ remarks: null }).success).toBe(true);
  expect(body.safeParse({ remarks: '' }).success).toBe(true);
  expect(body.safeParse({ remarks: 'Text', amount: 1 }).success).toBe(false);
  expect(body.safeParse({ remarks: 'x'.repeat(5001) }).success).toBe(false);
  expect(body.safeParse({}).success).toBe(false);
});
it('requires branch assignment or explicit all-branch permission and rejects unassigned documents', () => {
  const actor = { userId: 'staff', branchId: 'home', allBranches: false };
  expect(() => assertDocumentBranch(actor, 'other')).toThrow();
  expect(() => assertDocumentBranch({ ...actor, branchId: null }, 'home')).toThrow();
  expect(() => assertDocumentBranch({ ...actor, allBranches: true }, 'other')).not.toThrow();
  expect(() => assertDocumentBranch({ ...actor, allBranches: true }, null)).toThrow();
});
it('prints only planned part rows with snapshot prices, decimal totals and an internal flag', () => {
  const row = { id: 'line', type: 'PART', referenceId: 'part', partSource: 'L', description: 'Snapshot description', quantity: 1, rate: 0.1, amount: 0.1 };
  const print = projectPickingLines([row, { ...row, id: 'included', type: 'INCLUDED_PART', quantity: 2, amount: 0.2 }, { ...row, type: 'LABOUR', amount: 900 }, { ...row, quantity: 0 }, { ...row, type: 'COMPLAINT' }], [{ id: 'part', partNumber: 'P-001', uom: 'LITRE' }]);
  expect(print.totals).toEqual({ numberOfItems: 2, quantityRequired: 3, totalAmount: 0.3 });
  expect(print.lines[0]).toMatchObject({ partNumber: 'P-001', flag: 'L', uom: 'LITRE', rate: 0.1, amount: 0.1, description: 'Snapshot description' });
  expect(projectPickingLines([row], []).lines[0].partNumber).toBeNull();
  expect(projectPickingLines([], []).totals.totalAmount).toBe(0);
});
