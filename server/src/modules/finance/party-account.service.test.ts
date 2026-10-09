jest.mock('../../prisma/client', () => ({ __esModule:true,default:{
  $transaction:jest.fn(),$queryRaw:jest.fn(),customer:{findUnique:jest.fn()},branch:{findFirst:jest.fn()},
  partyAdjustmentBatch:{findUnique:jest.fn(),create:jest.fn(),update:jest.fn()},
  receiptAllocation:{createMany:jest.fn(),updateMany:jest.fn()},
  invoice:{update:jest.fn(),count:jest.fn()},receipt:{update:jest.fn(),count:jest.fn()},
  partyNote:{update:jest.fn(),count:jest.fn(),findUnique:jest.fn(),create:jest.fn()},
  tallyPostingLog:{findFirst:jest.fn()},auditLog:{create:jest.fn()},documentSequence:{upsert:jest.fn()},payment:{deleteMany:jest.fn()},
} }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PartyAccountService, availablePartyCredit, withPartyTransaction } from './party-account.service';
const customerId='11111111-1111-4111-8111-111111111111', branchId='22222222-2222-4222-8222-222222222222', invoiceId='33333333-3333-4333-8333-333333333333',receiptId='44444444-4444-4444-8444-444444444444',noteId='55555555-5555-4555-8555-555555555555';
const input={customerId,branchId,date:'2026-01-02T00:00:00.000Z',source:'ADVANCE_ADJUSTMENT' as const,idempotencyKey:'66666666-6666-4666-8666-666666666666',debits:[{id:invoiceId,kind:'INVOICE' as const,amount:40}],credits:[{id:receiptId,kind:'RECEIPT' as const,amount:40}]};
const invoice={id:invoiceId,kind:'INVOICE',number:'2026000001',date:new Date('2026-01-01'),amount:100,balance:60};
const receipt={id:receiptId,kind:'RECEIPT',number:'2026000002',date:new Date('2026-01-01'),amount:100,balance:70};
const batch={id:'batch',...input,amount:new Prisma.Decimal(40),reversedAt:null,tallyPostedAt:null,legacyPaymentId:null,allocations:[{invoiceId,receiptId,debitNoteId:null,creditNoteId:null,amount:40}]};
beforeEach(()=>{
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback=>callback(prisma));
  (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM (')) ? Promise.resolve(query.sql.includes('FROM "Invoice"') ? [invoice] : [receipt]) : Promise.resolve(query.sql.includes('AS amount') ? [{ amount:new Prisma.Decimal(50) }] : []));
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({id:customerId,branchId});
  (prisma.branch.findFirst as jest.Mock).mockResolvedValue({id:branchId});
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.partyAdjustmentBatch.create as jest.Mock).mockImplementation(({data})=>Promise.resolve({id:'batch',...data}));
  (prisma.invoice.count as jest.Mock).mockResolvedValue(0);(prisma.receipt.count as jest.Mock).mockResolvedValue(0);(prisma.partyNote.count as jest.Mock).mockResolvedValue(0);
  (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({value:1});
  (prisma.partyNote.create as jest.Mock).mockImplementation(({data})=>Promise.resolve({id:noteId,...data}));
});
it('records dated canonical pairs, both balances and audit atomically under row locks',async()=>{
  await new PartyAccountService().createAdjustment(input,'actor');
  expect(prisma.invoice.update).toHaveBeenCalledWith({where:{id:invoiceId},data:{outstandingAmount:20,status:'Partially Paid'}});
  expect(prisma.receipt.update).toHaveBeenCalledWith({where:{id:receiptId},data:{advanceAmount:30}});
  expect(prisma.receiptAllocation.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({batchId:'batch',invoiceId,receiptId,amount:40,adjustedAt:new Date(input.date)})]});
  expect(prisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'PARTY_ADJUSTMENT_CREATED',userId:'actor'})});
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable',maxWait:5000,timeout:15000});
  expect((prisma.$queryRaw as jest.Mock).mock.calls.map(call=>call[0].sql).join(' ')).toContain('ORDER BY id FOR UPDATE');
});
it('same key returns the original batch and rejects different details',async()=>{
  const service=new PartyAccountService();const first=await service.createAdjustment(input,'actor');
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue(first);
  expect(await service.createAdjustment(input,'actor')).toEqual(first);
  await expect(service.createAdjustment({...input,source:'FIFO'},'actor')).rejects.toThrow('different details');
  expect(prisma.receiptAllocation.createMany).toHaveBeenCalledTimes(1);
});
it.each(['overdrawn','foreign','later date'])('rejects %s documents before financial writes',async scenario=>{
  (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM (')) ? Promise.resolve(query.sql.includes('FROM "Invoice"') ? scenario==='foreign'?[]:[{...invoice,balance:scenario==='overdrawn'?30:60,date:scenario==='later date'?new Date('2026-02-01'):invoice.date}] : [receipt]) : Promise.resolve([]));
  await expect(new PartyAccountService().createAdjustment(input,'actor')).rejects.toThrow();
  expect(prisma.partyAdjustmentBatch.create).not.toHaveBeenCalled();expect(prisma.invoice.update).not.toHaveBeenCalled();
});
it('unifies receipt advances and opening/note credits using database sums',async()=>{
  expect(await availablePartyCredit(prisma,customerId,branchId)).toBe(50);
  const query=(prisma.$queryRaw as jest.Mock).mock.calls[0][0];
  expect(query.sql).toContain('SUM(ROUND(r."advanceAmount"::numeric,2))');
  expect(query.sql).toContain("n.direction = 'CREDIT'");
  expect(query.values).toEqual(expect.arrayContaining([customerId,branchId]));
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
});
it('creates numbered, excluded opening credits and is idempotent',async()=>{
  const service=new PartyAccountService();const opening={customerId,branchId,date:input.date,direction:'CREDIT' as const,amount:10,narration:'Balance brought forward',idempotencyKey:input.idempotencyKey};
  const note=await service.openingBalance(opening,'actor');
  expect(prisma.partyNote.create).toHaveBeenCalledWith({data:expect.objectContaining({number:'2026000001',direction:'CREDIT',type:'OPENING',tallyExcluded:true,remainingAmount:new Prisma.Decimal(10),createdById:'actor'})});
  (prisma.partyNote.findUnique as jest.Mock).mockResolvedValue(note);
  expect(await service.openingBalance(opening,'actor')).toEqual(note);
  await expect(service.openingBalance({...opening,amount:11},'actor')).rejects.toThrow('different details');
  expect(prisma.partyNote.create).toHaveBeenCalledTimes(1);
});
it('rejects an opening in a different party branch',async()=>{
  await expect(new PartyAccountService().openingBalance({customerId,branchId:noteId,date:input.date,direction:'DEBIT',amount:10,narration:'Opening',idempotencyKey:input.idempotencyKey},'actor')).rejects.toThrow('customer branch');
});
it('reverses once, restores both balances and retains dated rows with the remark',async()=>{
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue(batch);
  (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM (')) ? Promise.resolve(query.sql.includes('FROM "Invoice"') ? [{...invoice,balance:20}] : [{...receipt,balance:30}]) : Promise.resolve([]));
  await new PartyAccountService().reverse('batch','Correct allocation','actor');
  expect(prisma.invoice.update).toHaveBeenCalledWith({where:{id:invoiceId},data:{outstandingAmount:60,status:'Partially Paid'}});
  expect(prisma.receipt.update).toHaveBeenCalledWith({where:{id:receiptId},data:{advanceAmount:70}});
  expect(prisma.receiptAllocation.updateMany).toHaveBeenCalledWith({where:{batchId:'batch'},data:{reversedAt:expect.any(Date)}});
  expect(prisma.partyAdjustmentBatch.update).toHaveBeenCalledWith({where:{id:'batch'},data:expect.objectContaining({reverseRemark:'Correct allocation',reversedById:'actor'})});
  expect(prisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'PARTY_ADJUSTMENT_REVERSED'})});
});
it.each(['batch','invoice','receipt','note','export'])('blocks reversal for Tally %s posting',async kind=>{
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue({...batch,tallyPostedAt:kind==='batch'?new Date():null});
  if(kind==='invoice')(prisma.invoice.count as jest.Mock).mockResolvedValue(1);
  if(kind==='receipt')(prisma.receipt.count as jest.Mock).mockResolvedValue(1);
  if(kind==='note')(prisma.partyNote.count as jest.Mock).mockResolvedValue(1);
  if(kind==='export')(prisma.tallyPostingLog.findFirst as jest.Mock).mockResolvedValue({id:'posting'});
  await expect(new PartyAccountService().reverse('batch','Reason','actor')).rejects.toThrow(/posted|Tally/i);
  expect(prisma.invoice.update).not.toHaveBeenCalled();
});
it('rejects duplicate reversal or a missing remark',async()=>{
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue({...batch,reversedAt:new Date()});
  await expect(new PartyAccountService().reverse('batch','Reason','actor')).rejects.toThrow('already been reversed');
  await expect(new PartyAccountService().reverse('batch',' ','actor')).rejects.toThrow('remark');
});
it('retries serialization rollbacks but does not replay uncertain timeouts',async()=>{
  (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('conflict',{code:'P2034',clientVersion:'6.19.3'}));
  await withPartyTransaction(async()=>42);expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  (prisma.$transaction as jest.Mock).mockReset().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('timeout',{code:'P2028',clientVersion:'6.19.3'}));
  await expect(withPartyTransaction(async()=>42)).rejects.toThrow('database is busy');expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('records note-to-opening-debit pairs through the same allocation store',async()=>{
 const noteDebit={...invoice,id:invoiceId,kind:'NOTE'};const noteCredit={...receipt,id:noteId,kind:'NOTE'};
 (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM ('))?Promise.resolve(query.sql.includes('FROM "Invoice"')?[noteDebit]:[noteCredit]):Promise.resolve([]));
 await new PartyAccountService().createAdjustment({...input,debits:[{id:invoiceId,kind:'NOTE',amount:40}],credits:[{id:noteId,kind:'NOTE',amount:40}]},'actor');
 expect(prisma.receiptAllocation.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({debitNoteId:invoiceId,creditNoteId:noteId,invoiceId:undefined,receiptId:undefined,amount:40})]});
 expect(prisma.partyNote.update).toHaveBeenCalledWith({where:{id:invoiceId},data:{remainingAmount:new Prisma.Decimal(20)}});
 expect(prisma.partyNote.update).toHaveBeenCalledWith({where:{id:noteId},data:{remainingAmount:new Prisma.Decimal(30)}});
});
it('blocks vendor parties from adjustment and opening entry',async()=>{
 (prisma.customer.findUnique as jest.Mock).mockResolvedValue({id:customerId,branchId,type:'VENDOR'});
 await expect(new PartyAccountService().createAdjustment(input,'actor')).rejects.toThrow('Vendor');
 await expect(new PartyAccountService().openingBalance({customerId,branchId,date:input.date,direction:'CREDIT',amount:1,narration:'Opening',idempotencyKey:input.idempotencyKey},'actor')).rejects.toThrow('Vendor');
 expect(prisma.partyAdjustmentBatch.create).not.toHaveBeenCalled();expect(prisma.partyNote.create).not.toHaveBeenCalled();
});

it('reverses migrated credit-note approvals and removes their linked legacy Payment atomically',async()=>{
 (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue({...batch,source:'CREDIT_APPLICATION',legacyPaymentId:'legacy-payment',allocations:[{invoiceId,receiptId:null,debitNoteId:null,creditNoteId:noteId,amount:40}]});
 (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM ('))?Promise.resolve(query.sql.includes('FROM "Invoice"')?[{...invoice,balance:20}]:[{...receipt,id:noteId,kind:'NOTE',amount:40,balance:0}]):Promise.resolve([]));
 await new PartyAccountService().reverse('batch','Correct legacy approval','actor');
 expect(prisma.partyNote.update).toHaveBeenCalledWith({where:{id:noteId},data:{remainingAmount:new Prisma.Decimal(40)}});
 expect(prisma.payment.deleteMany).toHaveBeenCalledWith({where:{id:'legacy-payment',method:'Credit'}});
 expect(prisma.invoice.update).toHaveBeenCalledWith({where:{id:invoiceId},data:{outstandingAmount:60,status:'Partially Paid'}});
 expect(prisma.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'PARTY_ADJUSTMENT_REVERSED',details:expect.stringContaining('legacy-payment')})});
});

it('rejects future effective dates without financial writes',async()=>{
 await expect(new PartyAccountService().createAdjustment({...input,date:'2099-01-01T00:00:00.000Z'},'actor')).rejects.toThrow('future');
 await expect(new PartyAccountService().openingBalance({customerId,branchId,date:'2099-01-01T00:00:00.000Z',direction:'DEBIT',amount:1,narration:'Opening',idempotencyKey:input.idempotencyKey},'actor')).rejects.toThrow('future');
 expect(prisma.receiptAllocation.createMany).not.toHaveBeenCalled();expect(prisma.partyNote.create).not.toHaveBeenCalled();
});

it('reads account debit and credit totals from one decimal database snapshot',async()=>{
 (prisma.$queryRaw as jest.Mock).mockResolvedValue([{outstanding:new Prisma.Decimal('0.30'),availableCredit:new Prisma.Decimal('0.10')}]);
 const account=await new PartyAccountService().account(customerId,branchId);
 expect(account).toMatchObject({outstanding:0.3,availableCredit:0.1,netOutstanding:0.2});
 expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
 const query=(prisma.$queryRaw as jest.Mock).mock.calls[0][0];expect(query.sql).toContain('AS outstanding');expect(query.sql).toContain('AS "availableCredit"');
 expect(query.values).toEqual(expect.arrayContaining([customerId,branchId]));
});

it('rejects reusing a restored balance before its recorded reversal date',async()=>{
 (prisma.$queryRaw as jest.Mock).mockImplementation(query=>(query.sql.startsWith('SELECT d.*,activity.') || query.sql.startsWith('SELECT * FROM ('))?Promise.resolve(query.sql.includes('FROM "Invoice"')?[invoice]:[{...receipt,latestActivityAt:new Date('2026-01-03')}]):Promise.resolve([]));
 await expect(new PartyAccountService().createAdjustment(input,'actor')).rejects.toThrow('latest balance change');
 expect(prisma.partyAdjustmentBatch.create).not.toHaveBeenCalled();expect(prisma.receipt.update).not.toHaveBeenCalled();
});
