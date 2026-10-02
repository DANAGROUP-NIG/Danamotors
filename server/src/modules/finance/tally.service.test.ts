import { generateTallyImportXml, generateTallyVoucherXml } from './tally-xml';

describe('Tally XML generation', () => {
  it('escapes ledger names and emits the selected voucher number and date', () => {
    const voucher = generateTallyVoucherXml({
      type: 'JOB_BILL',
      number: '2026000001',
      date: new Date('2026-09-28T12:00:00.000Z'),
      party: 'A & B Motors',
      entries: [
        { name: 'A & B Motors', amount: 1075 },
        { name: 'Workshop Sales', amount: -1000 },
        { name: 'VAT Output', amount: -75 },
      ],
    });

    expect(voucher).toContain('<DATE>20260928</DATE>');
    expect(voucher).toContain('<VOUCHERNUMBER>2026000001</VOUCHERNUMBER>');
    expect(voucher).toContain('<PARTYLEDGERNAME>A &amp; B Motors</PARTYLEDGERNAME>');
    expect(voucher.match(/<ALLLEDGERENTRIES\.LIST>/g)).toHaveLength(3);
  });

  it('wraps generated vouchers in a Tally import envelope', () => {
    const xml = generateTallyImportXml(['<TALLYMESSAGE />']);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<REQUESTDATA><TALLYMESSAGE />');
  });
});