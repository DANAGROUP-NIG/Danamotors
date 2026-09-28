export type TallyDocumentType = 'JOB_BILL' | 'RECEIPT';
export type LedgerEntry = { name: string; amount: number };

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
}[character]!));

export function generateTallyVoucherXml(input: {
  type: TallyDocumentType;
  number: string;
  date: Date;
  party: string;
  entries: LedgerEntry[];
}) {
  const voucherType = input.type === 'JOB_BILL' ? 'Sales' : 'Receipt';
  const ledgerEntries = input.entries.map((entry) => `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(entry.name)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>${entry.amount >= 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
          <AMOUNT>${entry.amount.toFixed(2)}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join('');
  return `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
          <DATE>${input.date.toISOString().slice(0, 10).replace(/-/g, '')}</DATE>
          <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${escapeXml(input.number)}</VOUCHERNUMBER>
          <PARTYLEDGERNAME>${escapeXml(input.party)}</PARTYLEDGERNAME>
          ${ledgerEntries}
        </VOUCHER>
      </TALLYMESSAGE>`;
}

export function generateTallyImportXml(vouchers: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY><IMPORTDATA>
    <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
    <REQUESTDATA>${vouchers.join('')}
    </REQUESTDATA>
  </IMPORTDATA></BODY>
</ENVELOPE>`;
}