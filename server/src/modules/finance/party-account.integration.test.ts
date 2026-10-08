// Only run against an explicitly supplied, migrated disposable database.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PartyAccountService, availablePartyCredit } from './party-account.service';
import { ReceiptService } from './receipt.service';
import { CustomerService } from '../customer/customer.service';
const integration=process.env.TEST_DATABASE_URL?describe:describe.skip;
integration('Party adjustments in PostgreSQL',()=>{
 afterAll(async()=>{await prisma.$disconnect();});
 it('applies advances and opening credits once, enforces Tally reversal and maintains the derived wallet',async()=>{
  const rollback=new Error('ROLLBACK_PARTY_FIXTURES');const original=prisma.$transaction.bind(prisma);
  await expect(original(async tx=>{
   const suffix=randomUUID();const branch=await tx.branch.create({data:{name:'party-'+suffix}});
   const role=await tx.role.upsert({where:{name:'Admin'},update:{},create:{name:'Admin'}});
   const actor=await tx.user.create({data:{email:suffix+'@example.test',firstName:'Test',lastName:'Admin',passwordHash:'not-a-login',roleId:role.id,branchId:branch.id}});
   const customer=await tx.customer.create({data:{firstName:'Test',lastName:'Party',branchId:branch.id}});
   const date=new Date(Date.now()-86400000).toISOString();
   const spy=jest.spyOn(prisma,'$transaction').mockImplementation(((callback:(client:Prisma.TransactionClient)=>Promise<unknown>)=>callback(tx)) as typeof prisma.$transaction);
   try {
    const receipts=new ReceiptService();const service=new PartyAccountService();
    const receipt=await receipts.createReceipt({customerId:customer.id,branchId:branch.id,issuedById:actor.id,issuedAt:new Date(Date.now()-3*86400000).toISOString(),mode:'CASH',category:'SERVICE_PARTS',amount:100,allocations:[],idempotencyKey:randomUUID()});
    expect(await availablePartyCredit(tx,customer.id)).toBe(100);
    const openingInput={customerId:customer.id,branchId:branch.id,direction:'CREDIT' as const,date:new Date(Date.now()-2*86400000).toISOString(),amount:20,narration:'Brought forward',idempotencyKey:randomUUID()};
    const credit=await service.openingBalance(openingInput,actor.id);expect((await service.openingBalance(openingInput,actor.id)).id).toBe(credit.id);
    expect(credit.tallyExcluded).toBe(true);expect(await availablePartyCredit(tx,customer.id)).toBe(120);
    const invoice=await tx.invoice.create({data:{customerId:customer.id,invoiceNumber:'party-'+suffix,issuedDate:new Date(Date.now()-2*86400000),subtotal:80,tax:0,total:80,outstandingAmount:80,status:'Unpaid'}});
    const input={customerId:customer.id,branchId:branch.id,date,source:'ADVANCE_ADJUSTMENT' as const,idempotencyKey:randomUUID(),debits:[{id:invoice.id,kind:'INVOICE' as const,amount:60}],credits:[{id:receipt.id,kind:'RECEIPT' as const,amount:40},{id:credit.id,kind:'NOTE' as const,amount:20}]};
    const batch=await service.createAdjustment(input,actor.id);expect((await service.createAdjustment(input,actor.id)).id).toBe(batch.id);
    expect(await tx.receiptAllocation.count({where:{batchId:batch.id}})).toBe(2);
    expect((await tx.invoice.findUniqueOrThrow({where:{id:invoice.id}})).outstandingAmount).toBe(20);
    expect(await availablePartyCredit(tx,customer.id)).toBe(60);
    expect((await tx.customer.update({where:{id:customer.id},data:{creditBalance:999}})).creditBalance).toBe(60);
    await expect(receipts.cancelReceipt(receipt.id,'Cancel',actor.id)).rejects.toThrow('Reverse later');
    await tx.receipt.update({where:{id:receipt.id},data:{tallyPostedAt:new Date()}});
    await expect(service.reverse(batch.id,'Correct',actor.id)).rejects.toThrow('Tally');
    await tx.receipt.update({where:{id:receipt.id},data:{tallyPostedAt:null}});
    await service.reverse(batch.id,'Correct',actor.id);
    expect((await tx.invoice.findUniqueOrThrow({where:{id:invoice.id}})).outstandingAmount).toBe(80);
    expect(await availablePartyCredit(tx,customer.id)).toBe(120);
    expect(await tx.receiptAllocation.count({where:{batchId:batch.id,reversedAt:{not:null}}})).toBe(2);
    await expect(service.reverse(batch.id,'Again',actor.id)).rejects.toThrow('already been reversed');
    await receipts.cancelReceipt(receipt.id,'Not needed',actor.id);expect(await availablePartyCredit(tx,customer.id)).toBe(20);
    expect(await tx.auditLog.count({where:{userId:actor.id,action:{in:['PARTY_ADJUSTMENT_CREATED','PARTY_ADJUSTMENT_REVERSED']}}})).toBe(2);
    const movedBatch=await service.createAdjustment({...input,idempotencyKey:randomUUID(),debits:[{id:invoice.id,kind:'INVOICE',amount:10}],credits:[{id:credit.id,kind:'NOTE',amount:10}]},actor.id);
    const targetBranch=await tx.branch.create({data:{name:'target-'+suffix}});
    const target=await tx.customer.create({data:{firstName:'Test',lastName:'Target',branchId:targetBranch.id}});
    await new CustomerService().merge(customer.id,target.id,actor.id);
    expect(await availablePartyCredit(tx,target.id)).toBe(10);
    await service.reverse(movedBatch.id,'Correct after merge',actor.id);
    expect(await availablePartyCredit(tx,target.id)).toBe(20);
    expect((await tx.customer.findUniqueOrThrow({where:{id:customer.id}})).creditBalance).toBe(0);
    expect((await tx.customer.findUniqueOrThrow({where:{id:target.id}})).creditBalance).toBe(20);
    expect((await tx.partyNote.findUniqueOrThrow({where:{id:credit.id}})).customerId).toBe(target.id);
    expect((await tx.partyAdjustmentBatch.findUniqueOrThrow({where:{id:batch.id}})).customerId).toBe(target.id);
   } finally {spy.mockRestore();}
   throw rollback;
  },{isolationLevel:'Serializable',timeout:30000})).rejects.toBe(rollback);
 },40000);
});
