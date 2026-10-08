import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError,ConflictError,NotFoundError } from '../../shared/errors/appError';
import { lockParty,withPartyTransaction } from './party-account.service';
import { nextDocumentNumber } from './document-number';
import { reportStart,reportEnd } from './party-report';
import { cancelPartyNoteSchema,createPartyNoteBody,type CreatePartyNoteInput,type NoteRegisterInput } from './party-note.validation';
import { assertNoteCancellable,validateReceiptNoteLines } from './party-note';
const include={customer:{select:{id:true,code:true,firstName:true,lastName:true,companyName:true}},branch:{select:{id:true,name:true}},receiptLines:{orderBy:{position:'asc' as const}},accountLines:{orderBy:{position:'asc' as const}}};
const whereFor=(input:NoteRegisterInput):Prisma.PartyNoteWhereInput=>({type:{not:'OPENING'},direction:input.direction,date:{gte:reportStart(input.from),lt:reportEnd(input.to)},...(input.branchId?{branchId:input.branchId}:{}),...(input.customerId?{customerId:input.customerId}:{})});
export class PartyNoteService{
 async create(input:CreatePartyNoteInput,actorId:string){
  input=createPartyNoteBody.parse(input);
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  try{return await withPartyTransaction(async tx=>{
   const customer=await lockParty(tx,input.customerId);
   if(customer.type.toUpperCase()==='VENDOR'||customer.branchId!==input.branchId)throw new BadRequestError('Choose a debtor party in this branch');
   const existing=await tx.partyNote.findUnique({where:{idempotencyKey:input.idempotencyKey},include});
   if(existing){if(existing.requestHash!==hash)throw new ConflictError('This request key was already used with different details');return existing;}
   if(!await tx.branch.findUnique({where:{id:input.branchId}}))throw new NotFoundError('Branch not found');
   const date=reportStart(input.date);
   if(date>new Date())throw new BadRequestError('Note date cannot be in the future');
   const receipts=input.direction==='DEBIT'&&input.type==='RECEIPT'?await tx.receipt.findMany({where:{id:{in:input.receiptLines.map(l=>l.receiptId)}},orderBy:{id:'asc'}}):[];
   if(receipts.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM "Receipt" WHERE id IN (${Prisma.join(receipts.map(r=>r.id))}) ORDER BY id FOR UPDATE`);
   if(input.direction==='DEBIT'&&input.type==='RECEIPT')validateReceiptNoteLines(input.receiptLines,receipts,input.customerId,input.branchId,date);
   const ledgers=input.direction==='CREDIT'?await tx.tallyLedger.findMany({where:{id:{in:input.accountLines.map(l=>l.ledgerId)},active:true}}):[];
   if(input.direction==='CREDIT'&&input.accountLines.some(l=>!ledgers.some(a=>a.id===l.ledgerId)))throw new BadRequestError('Choose active Tally accounts for every line');
   const note=await tx.partyNote.create({data:{
    customerId:input.customerId,branchId:input.branchId,direction:input.direction,type:input.type,date,narration:input.narration,
    amount:new Prisma.Decimal(input.amount),remainingAmount:new Prisma.Decimal(input.amount),number:await nextDocumentNumber(tx,input.direction==='DEBIT'?'DEBIT_NOTE':'CREDIT_NOTE',new Date(input.date+'T12:00:00Z')),
    tallyExcluded:false,createdById:actorId,idempotencyKey:input.idempotencyKey,requestHash:hash,
    partyCode:customer.code,partyName:customer.companyName||customer.firstName+' '+customer.lastName,
    partyAddress:[customer.house,customer.street,customer.address].filter(Boolean).join(', '),partyCity:customer.city,partyState:customer.state,
    ...(input.direction==='DEBIT'&&input.type==='RECEIPT'?{receiptLines:{create:input.receiptLines.map((l,position)=>{const r=receipts.find(r=>r.id===l.receiptId)!;return {...l,amount:new Prisma.Decimal(l.amount),position,receiptNumber:r.receiptNumber,receiptDate:r.issuedAt,chequeNumber:r.chequeNumber,receiptAmount:new Prisma.Decimal(r.amount).toDecimalPlaces(2),narration:r.notes??''};})}}:{}),
    ...(input.direction==='CREDIT'?{accountLines:{create:input.accountLines.map((l,position)=>{const a=ledgers.find(a=>a.id===l.ledgerId)!;return {...l,amount:new Prisma.Decimal(l.amount),position,accountCode:a.code,accountName:a.name};})}}:{}),
   },include});
   await tx.auditLog.create({data:{userId:actorId,action:'PARTY_NOTE_CREATED',details:JSON.stringify({noteId:note.id,direction:note.direction,amount:input.amount,number:note.number,branchId:note.branchId})}});
   return note;
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'){const existing=await prisma.partyNote.findUnique({where:{idempotencyKey:input.idempotencyKey},include});if(existing?.requestHash===hash)return existing;throw new ConflictError('This request key was already used with different details');}throw e;}
 }
 async get(id:string){const note=await prisma.partyNote.findUnique({where:{id},include});if(!note||note.type==='OPENING')throw new NotFoundError('Note not found');return note;}
 async cancel(id:string,remark:string,actorId:string,branchId?:string){
  remark=cancelPartyNoteSchema.shape.body.parse({remark}).remark;
  const identity=await this.get(id);
  return withPartyTransaction(async tx=>{
   await lockParty(tx,identity.customerId);
   await tx.$queryRaw(Prisma.sql`SELECT id FROM "PartyNote" WHERE id=${id} FOR UPDATE`);
   const note=await tx.partyNote.findUnique({where:{id}});
   if(!note||note.type==='OPENING')throw new NotFoundError('Note not found');
   if(branchId&&note.branchId!==branchId)throw new BadRequestError('Note belongs to another branch');
   const count=await tx.receiptAllocation.count({where:{reversedAt:null,OR:[{debitNoteId:id},{creditNoteId:id}]}});
   assertNoteCancellable(note,count>0);
   const cancelledAt=new Date();
   const result=await tx.partyNote.update({where:{id},data:{status:'CANCELLED',remainingAmount:0,cancelRemark:remark,cancelledAt},include});
   await tx.tallyPostingLog.updateMany({where:{documentId:id,documentType:note.direction==='DEBIT'?'DEBIT_NOTE':'CREDIT_NOTE',status:'EXPORTED'},data:{status:'INVALIDATED'}});
   await tx.auditLog.create({data:{userId:actorId,createdAt:cancelledAt,action:'PARTY_NOTE_CANCELLED',details:JSON.stringify({noteId:id,remark,amount:note.amount.toString(),branchId:note.branchId})}});
   return result;
  });
 }
 async receipts(customerId:string,branchId:string,search:string,page:number){
  const where:Prisma.ReceiptWhereInput={customerId,branchId,status:'ACTIVE',...(search?{OR:[{receiptNumber:{contains:search,mode:'insensitive'}},{chequeNumber:{contains:search,mode:'insensitive'}}]}:{})};
  return prisma.$transaction(async tx=>{const [receipts,total]=await Promise.all([tx.receipt.findMany({where,select:{id:true,receiptNumber:true,issuedAt:true,chequeNumber:true,amount:true,notes:true},orderBy:[{issuedAt:'desc'},{id:'asc'}],skip:(page-1)*25,take:25}),tx.receipt.count({where})]);return {receipts,meta:{page,total,totalPages:Math.ceil(total/25)}};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async register(input:NoteRegisterInput){
  return prisma.$transaction(async tx=>{const where=whereFor(input);const [notes,total,totals]=await Promise.all([tx.partyNote.findMany({where,include,orderBy:[{date:'asc'},{number:'asc'},{id:'asc'}],skip:(input.page-1)*input.pageSize,take:input.pageSize}),tx.partyNote.count({where}),tx.partyNote.aggregate({where,_sum:{amount:true,remainingAmount:true}})]);return {notes,totals:{amount:totals._sum.amount??new Prisma.Decimal(0),remaining:totals._sum.remainingAmount??new Prisma.Decimal(0)},meta:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize)}};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async stream(input:NoteRegisterInput,consume:(notes:Awaited<ReturnType<PartyNoteService['get']>>[])=>Promise<void>){
  await prisma.$transaction(async tx=>{let cursor:string|undefined;for(;;){const rows=await tx.partyNote.findMany({where:whereFor(input),include,orderBy:[{date:'asc'},{number:'asc'},{id:'asc'}],take:250,...(cursor?{cursor:{id:cursor},skip:1}:{})});if(!rows.length)break;await consume(rows);cursor=rows[rows.length-1].id;}},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000});
 }
}
