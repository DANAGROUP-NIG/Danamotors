import { reviewApprovedScope, type ApprovalEstimate, type ScopeLine } from './estimate-approval';
const service = { type: 'SERVICE', referenceId: 'service', description: 'Full service', quantity: 1, rate: 1000, amount: 1000 };
const part = { type: 'PART', referenceId: 'part', description: 'Filter', quantity: 2, rate: 100, amount: 200 };
const labour = { type: 'LABOUR', referenceId: 'operation', description: 'Inspection', quantity: 1, rate: 200, amount: 200 };
const approved: ApprovalEstimate = { id: 'revision', status: 'Approved', amount: 1400, approvals: [{ approved: true, customerId: 'customer' }], lines: [service, part, labour] };
const review = (actual: ScopeLine[], estimate: ApprovalEstimate | undefined = approved) => reviewApprovedScope(estimate, actual, 'customer');

it('requires an estimate and the current customer decision', () => {
  expect(reviewApprovedScope(undefined, [], 'customer').canBill).toBe(false);
  expect(review([], { ...approved, status: 'Pending', approvals: [] }).status).toBe('Awaiting Approval');
  expect(review([], { ...approved, status: 'Declined', approvals: [{ approved: false, customerId: 'customer' }] }).status).toBe('Revision Required');
  expect(reviewApprovedScope(approved, [], 'other-customer').canBill).toBe(false);
});
it('compares reduced actual quantities without charging unused approved work', () => {
  const result = review([service, { ...part, quantity: 1, amount: 100 }]);
  expect(result.canBill).toBe(true);
  expect(result.approvedSubtotal).toBe(1400);
  expect(result.actualSubtotal).toBe(1100);
});
it('blocks a new operation even when the overall actual cost is lower', () => {
  expect(review([{ ...labour, referenceId: 'unapproved' }]).issues.join(' ')).toContain('Not in approved scope');
});
it('aggregates multiple issues of the same part against the approved quantity', () => {
  expect(review([{ ...part, quantity: 1, amount: 100 }, part]).issues.join(' ')).toContain('Quantity / hours');
});
it('requires approval for a higher rate even if fewer units cost less overall', () => {
  expect(review([{ ...part, quantity: 1, rate: 150, amount: 150 }]).issues.join(' ')).toContain('Charge exceeds approval');
});
it('does not charge again for package parts and labour', () => {
  const result = review([service, part, labour], { ...approved, lines: [service, { ...part, type: 'INCLUDED_PART', rate: 0, amount: 0 }, { ...labour, type: 'INCLUDED_LABOUR', rate: 0, amount: 0 }] });
  expect(result.canBill).toBe(true);
  expect(result.actualSubtotal).toBe(1000);
  expect(result.rows.filter(row => row.included).every(row => row.actualAmount === 0)).toBe(true);
});
it('still caps package quantities', () => {
  expect(review([{ ...part, quantity: 3 }], { ...approved, lines: [{ ...part, type: 'INCLUDED_PART', rate: 0, amount: 0 }] }).canBill).toBe(false);
});
it('requires revision for ambiguous legacy duplicate estimate lines', () => {
  expect(review([part], { ...approved, lines: [part, part] }).canBill).toBe(false);
});
