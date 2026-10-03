import { generateTallyVoucherXml } from './tally-xml';

it('exports balanced Tally signs and escaped bill references with a stable remote ID', () => {
  const xml = generateTallyVoucherXml({ type: 'JOB_BILL', id: 'stable-id', number: 'B1', date: new Date('2026-10-02'), party: 'A & B', entries: [
    { name: 'A & B', amount: 1075, bills: [{ name: 'B1', type: 'New Ref', amount: 1075 }] },
    { name: 'Service', amount: -1000 }, { name: 'VAT', amount: -75 },
  ] });
  expect(xml).toContain('REMOTEID="stable-id"');
  expect(xml).toContain('<LEDGERNAME>A &amp; B</LEDGERNAME>');
  expect(xml).toContain('<AMOUNT>-1075.00</AMOUNT>');
  expect(xml).toContain('<AMOUNT>1000.00</AMOUNT>');
  expect(xml).toContain('<BILLTYPE>New Ref</BILLTYPE>');
});
