import { fifoAdjustments, pairAdjustments, validateAdjustmentSelections, type PartyDocument } from './party-adjustment';
import { createAdjustmentSchema, openingBalanceSchema, reverseAdjustmentSchema } from './party-account.validation';
const document = (id: string, balance: number, date = '2026-01-01', number = id, kind: PartyDocument['kind'] = 'INVOICE'): PartyDocument => ({ id, kind, balance, amount: balance, date: new Date(date), number });
const selection = (id: string, amount: number, kind: PartyDocument['kind'] = 'INVOICE') => ({ id, kind, amount });
it('FIFO orders date then document number and leaves the last document partially filled', () => {
  const debits = [document('later', 100, '2026-02-01'), document('second', 20, '2026-01-01','002'), document('first',30,'2026-01-01','001')];
  const credits = [document('receipt',40,'2026-01-01','001','RECEIPT'),document('note',5,'2026-01-02','002','NOTE')];
  expect(fifoAdjustments(debits,credits)).toEqual({ amount:45, debits:[selection('first',30),selection('second',15)],credits:[selection('receipt',40,'RECEIPT'),selection('note',5,'NOTE')] });
  expect(debits[0].id).toBe('later');
});
it('matches fractional currency exactly across many-to-many pairs', () => {
  const pairs = pairAdjustments([selection('i1',0.1),selection('i2',0.2)],[selection('r1',0.2,'RECEIPT'),selection('r2',0.1,'RECEIPT')]);
  expect(pairs.map(row=>row.amount)).toEqual([0.1,0.1,0.1]);
});
it('ignores exhausted documents and returns an empty FIFO plan without credits', () => {
  expect(fifoAdjustments([document('i',10),document('zero',0)],[])).toEqual({ amount:0,debits:[],credits:[] });
});
it.each([[0,0],[-1,-1],[10,9],[0.001,0.001]])('rejects invalid or unmatched totals %s/%s', (debit,credit) => {
  expect(()=>pairAdjustments([selection('i',debit)],[selection('r',credit,'RECEIPT')])).toThrow();
});
it('rejects duplicate, foreign, overdrawn and overprecise selections', () => {
  const documents = [document('i',20)];
  expect(()=>validateAdjustmentSelections([selection('i',10),selection('i',10)],documents)).toThrow('only once');
  expect(()=>validateAdjustmentSelections([selection('other',1)],documents)).toThrow('not available');
  expect(()=>validateAdjustmentSelections([selection('i',21)],documents)).toThrow('exceeds');
  expect(()=>validateAdjustmentSelections([selection('i',1.001)],documents)).toThrow('decimal');
  expect(()=>validateAdjustmentSelections([selection('i',20)],documents)).not.toThrow();
});
it('validates bounded selections, currency, opening narration and reversal remark', () => {
  const id='11111111-1111-4111-8111-111111111111';
  const body={customerId:id,branchId:id,idempotencyKey:id,date:'2026-01-01T00:00:00Z',debits:[selection(id,1)],credits:[selection(id,1,'RECEIPT')]};
  expect(createAdjustmentSchema.safeParse({body}).success).toBe(true);
  expect(createAdjustmentSchema.safeParse({body:{...body,debits:Array(201).fill(selection(id,1))}}).success).toBe(false);
  expect(openingBalanceSchema.safeParse({body:{...body,direction:'CREDIT',amount:1.001,narration:'Opening'}}).success).toBe(false);
  expect(openingBalanceSchema.safeParse({body:{...body,direction:'CREDIT',amount:1,narration:' '}}).success).toBe(false);
  expect(reverseAdjustmentSchema.safeParse({params:{id},body:{remark:' '}}).success).toBe(false);
});

it('caps batches/FIFO to the safe currency limit and rejects non-finite balances',()=>{
 expect(()=>pairAdjustments([selection('i',1e12),selection('i2',1)],[selection('r',1e12,'RECEIPT'),selection('r2',1,'RECEIPT')])).toThrow('supported range');
 expect(fifoAdjustments([document('i',1e12),document('i2',100)],[document('r',1e12,'2026-01-01','r','RECEIPT'),document('r2',100,'2026-01-02','r2','RECEIPT')]).amount).toBe(1e12);
 expect(()=>validateAdjustmentSelections([selection('i',1)],[document('i',NaN)])).toThrow('invalid balance');
});
