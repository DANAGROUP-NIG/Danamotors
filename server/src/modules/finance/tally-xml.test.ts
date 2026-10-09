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

describe('Debit and credit note vouchers',()=>{
 it.each([
  {type:'DEBIT_NOTE' as const,title:'Debit Note',partyAmount:125.5,accountAmount:-125.5},
  {type:'CREDIT_NOTE' as const,title:'Credit Note',partyAmount:-125.5,accountAmount:125.5},
 ])('emits balanced $title entries with the correct signs and escaped party/reference',({type,title,partyAmount,accountAmount})=>{
  const xml=generateTallyVoucherXml({type,number:'2026000001',id:'note<&',date:new Date('2026-10-01T00:00:00Z'),party:'A & B <Customer>',entries:[{name:'A & B <Customer>',amount:partyAmount,bills:[{name:'NOTE<&',type:type==='DEBIT_NOTE'?'New Ref':'On Account',amount:partyAmount}]},{name:'Charges & Credits',amount:accountAmount}]});
  expect(xml).toContain('VCHTYPE="'+title+'"');expect(xml).toContain('<VOUCHERTYPENAME>'+title+'</VOUCHERTYPENAME>');expect(xml).toContain('<DATE>20261001</DATE>');
  expect(xml).toContain('REMOTEID="note&lt;&amp;"');expect(xml).toContain('<NAME>NOTE&lt;&amp;</NAME>');
  const amounts=[...xml.matchAll(/<ALLLEDGERENTRIES\.LIST>[\s\S]*?<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map(m=>Number(m[1]));
  expect(amounts).toEqual([-partyAmount,-accountAmount]);expect(amounts.reduce((s,n)=>s+n,0)).toBe(0);
 });
 it('keeps credit note split account debits and against-reference credit allocations',()=>{
  const xml=generateTallyVoucherXml({type:'CREDIT_NOTE',number:'2026000002',date:new Date('2026-10-01'),party:'Customer',entries:[{name:'Customer',amount:-0.3,bills:[{name:'2026000010',type:'Agst Ref',amount:-0.3}]},{name:'Discount',amount:0.1},{name:'Returns',amount:0.2}]});
  expect(xml).toContain('<BILLTYPE>Agst Ref</BILLTYPE>');expect(xml).toContain('<AMOUNT>0.30</AMOUNT>');expect(xml).toContain('<AMOUNT>-0.10</AMOUNT>');expect(xml).toContain('<AMOUNT>-0.20</AMOUNT>');
 });
});
