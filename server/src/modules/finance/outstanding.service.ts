import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ConflictError, NotFoundError } from '../../shared/errors/appError';
import { withPartyTransaction } from './party-account.service';
import { partyScope,reportQuery } from './party-report.service';
import { DEFAULT_AGE_LIMITS,partyReportQuery } from './party-report.validation';
import { invoiceStatus,creditDaysSchema,lagosDay } from './credit-terms';
import { reportStart } from './party-report';
import { DEFAULT_LETTER_TEMPLATE,letterTemplateSchema,type MaintenanceFilters,type LetterFilters } from './outstanding.validation';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const escapeLetter=(value:unknown)=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]!));
type RepairRow={id:string;kind:'INVOICE'|'RECEIPT'|'NOTE';customerId:string;number:string;amount:Prisma.Decimal;stored:Prisma.Decimal;allocated:Prisma.Decimal;active:boolean;status:string;dueDate:Date|null;code:string|null;name:string};
export function repairDifference(row:RepairRow,now=new Date()) {
 const expected=row.active?row.amount.minus(row.allocated).toDecimalPlaces(2):new Prisma.Decimal(0);
 if(expected.isNegative()||expected.greaterThan(row.amount))throw new ConflictError('Invalid active allocations on '+row.number+'; repair the allocation data before recalculating');
 if(!row.active && !row.allocated.isZero())throw new ConflictError('Cancelled document '+row.number+' still has active allocations');
 const status=row.kind==='INVOICE'&&row.active?invoiceStatus(Number(expected),Number(row.amount),row.dueDate,now):row.status;
 return {...row,expected,statusBefore:row.status,status,changed:!expected.equals(row.stored)||status!==row.status};
}
async function repairRows(tx:Prisma.TransactionClient,input:MaintenanceFilters) {
 const report=partyReportQuery.parse({...input,asOn:lagosDay(new Date())});
 const {where}=await partyScope(tx,report);
 const branch=(alias:string,column='branchId')=>input.branchId?Prisma.sql`AND ${Prisma.raw(alias)}.${Prisma.raw('"'+column+'"')}=${input.branchId}`:Prisma.empty;
 return tx.$queryRaw<RepairRow[]>(Prisma.sql`WITH parties AS(SELECT c.id,c.code,c."branchId",COALESCE(NULLIF(c."companyName",''),TRIM(c."firstName"||' '||c."lastName")) name FROM "Customer" c WHERE ${where}),
 docs AS (
 SELECT i.id,'INVOICE'::text kind,i."customerId",i."invoiceNumber" number,ROUND(i.total::numeric,2) amount,ROUND(i."outstandingAmount"::numeric,2) stored,
 i."cancelledAt" IS NULL AND UPPER(i.status) NOT IN('CANCELLED','CANCELED','VOID') active,i.status,i."dueDate" FROM "Invoice" i LEFT JOIN "JobCard" j ON j.id=i."jobCardId" JOIN parties p ON p.id=i."customerId" ${input.branchId?Prisma.sql`WHERE COALESCE(i."reportBranchId",j."branchId",p."branchId")=${input.branchId}`:Prisma.empty}
 UNION ALL SELECT r.id,'RECEIPT',r."customerId",r."receiptNumber",ROUND(r.amount::numeric,2),ROUND(r."advanceAmount"::numeric,2),r.status='ACTIVE',r.status,NULL::timestamp FROM "Receipt" r JOIN parties p ON p.id=r."customerId" WHERE TRUE ${branch('r')}
 UNION ALL SELECT n.id,'NOTE',n."customerId",n.number,n.amount,n."remainingAmount",n.status='ACTIVE',n.status,NULL::timestamp FROM "PartyNote" n JOIN parties p ON p.id=n."customerId" WHERE TRUE ${branch('n')}
 ),
 selected_docs AS(SELECT * FROM docs ORDER BY "customerId",kind,id LIMIT 2001),
 allocations AS(
 SELECT 'INVOICE'::text kind,a."invoiceId" id,SUM(ROUND(a.amount::numeric,2)) amount FROM "ReceiptAllocation" a JOIN selected_docs d ON d.kind='INVOICE' AND d.id=a."invoiceId" WHERE a."reversedAt" IS NULL GROUP BY a."invoiceId"
 UNION ALL SELECT 'RECEIPT',a."receiptId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN selected_docs d ON d.kind='RECEIPT' AND d.id=a."receiptId" WHERE a."reversedAt" IS NULL GROUP BY a."receiptId"
 UNION ALL SELECT 'NOTE',a."debitNoteId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN selected_docs d ON d.kind='NOTE' AND d.id=a."debitNoteId" WHERE a."reversedAt" IS NULL GROUP BY a."debitNoteId"
 UNION ALL SELECT 'NOTE',a."creditNoteId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN selected_docs d ON d.kind='NOTE' AND d.id=a."creditNoteId" WHERE a."reversedAt" IS NULL GROUP BY a."creditNoteId")
 SELECT d.*,p.code,p.name,COALESCE(a.amount,0) allocated FROM selected_docs d JOIN parties p ON p.id=d."customerId" LEFT JOIN allocations a ON a.kind=d.kind AND a.id=d.id ORDER BY d."customerId",d.kind,d.id LIMIT 2001`);
}
async function repairPreview(tx:Prisma.TransactionClient,input:MaintenanceFilters) {
 const rows=await repairRows(tx,input);
 if(rows.length>2000)throw new BadRequestError('Select a narrower party range; repair previews support 2000 documents');
 const compared=rows.map(r=>repairDifference(r));
 const report=partyReportQuery.parse({...input,asOn:lagosDay(new Date())});
 const {where}=await partyScope(tx,report);
 const wallets=await tx.$queryRaw<Array<{id:string;code:string|null;name:string;stored:Prisma.Decimal;expected:Prisma.Decimal}>>(Prisma.sql`SELECT c.id,c.code,COALESCE(NULLIF(c."companyName",''),TRIM(c."firstName"||' '||c."lastName")) name,ROUND(c."creditBalance"::numeric,2) stored,
 COALESCE((SELECT SUM(ROUND(r."advanceAmount"::numeric,2)) FROM "Receipt" r WHERE r."customerId"=c.id AND r.status='ACTIVE'),0)+COALESCE((SELECT SUM(n."remainingAmount") FROM "PartyNote" n WHERE n."customerId"=c.id AND n.direction='CREDIT' AND n.status='ACTIVE'),0) expected
 FROM "Customer" c WHERE ${where} ${input.branchId?Prisma.sql`AND (c."branchId"=${input.branchId} OR EXISTS(SELECT 1 FROM "PartyReportDocument" d WHERE d."customerId"=c.id AND d."branchId"=${input.branchId}))`:Prisma.empty} ORDER BY c.id LIMIT 2001`);
 if(wallets.length>2000)throw new BadRequestError('Select a narrower party range; repair previews support 2000 parties');
 const directions=await tx.partyNote.findMany({where:{id:{in:compared.filter(r=>r.kind==='NOTE').map(r=>r.id)}},select:{id:true,direction:true}});
 for(const wallet of wallets){const delta=compared.filter(r=>r.customerId===wallet.id&&(r.kind==='RECEIPT'||r.kind==='NOTE'&&directions.some(n=>n.id===r.id&&n.direction==='CREDIT'))).reduce((sum,r)=>sum.plus(r.expected.minus(r.active?r.stored:0)),new Prisma.Decimal(0));wallet.expected=wallet.expected.plus(delta);}
 const previewHash=hash({day:lagosDay(new Date()),input,rows:compared,wallets});
 return {previewHash,checked:rows.length,partiesChecked:wallets.length,changes:compared.filter(r=>r.changed),wallets:wallets.filter(w=>!w.stored.equals(w.expected)),partyIds:wallets.map(w=>w.id),documents:compared};
}
type BillRow={customerId:string;code:string|null;name:string;id:string;number:string;kind:string;side:string;date:Date;amount:Prisma.Decimal;adjusted:Prisma.Decimal;balance:Prisma.Decimal;net:Prisma.Decimal;sortKey:string};
export class OutstandingService {
 async settings(tx:Prisma.TransactionClient=prisma){
  const settings=await tx.financeSetting.findMany({where:{key:{in:['defaultCreditDays','letterPrefix','letterTemplate']}}});
  const values=Object.fromEntries(settings.map(s=>[s.key,s.value]));
  return {defaultCreditDays:creditDaysSchema.parse(values.defaultCreditDays??30),letterPrefix:(()=>{const prefix=String(values.letterPrefix??'DML');if(!/^[A-Z][A-Z0-9]{1,9}$/.test(prefix))throw new BadRequestError('Invalid configured letter prefix');return prefix;})(),letterTemplate:letterTemplateSchema.parse(values.letterTemplate??DEFAULT_LETTER_TEMPLATE)};
 }
 async saveSettings(input:{defaultCreditDays:number;letterPrefix:string;letterTemplate:string},actorId:string){
  return withPartyTransaction(async tx=>{
   for(const [key,value] of Object.entries(input))await tx.financeSetting.upsert({where:{key},create:{key,value},update:{value}});
   await tx.auditLog.create({data:{userId:actorId,action:'OUTSTANDING_SETTINGS_UPDATED',details:JSON.stringify(input)}});
   return input;
  });
 }
 async previewRepair(input:MaintenanceFilters){return prisma.$transaction(tx=>repairPreview(tx,input),{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}).then(({partyIds: _ids,documents: _documents,...preview})=>preview);}
 async applyRepair(input:MaintenanceFilters,previewHash:string,actorId:string){
  return withPartyTransaction(async tx=>{
   const initialPreview=await repairPreview(tx,input);
   const initial=initialPreview.documents;
   const ids=initialPreview.partyIds.sort();
   if(ids.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM "Customer" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);
   for(const [kind,table] of [['INVOICE','Invoice'],['RECEIPT','Receipt'],['NOTE','PartyNote']] as const){
    const docs=initial.filter(r=>r.kind===kind).map(r=>r.id).sort();
    if(docs.length)await tx.$queryRaw(Prisma.sql`SELECT id FROM ${Prisma.raw('"'+table+'"')} WHERE id IN (${Prisma.join(docs)}) ORDER BY id FOR UPDATE`);
   }
   const preview=await repairPreview(tx,input);
   if(preview.previewHash!==previewHash)throw new ConflictError('Balances changed after preview. Preview again before applying');
   for(const row of preview.changes){
    if(row.kind==='INVOICE')await tx.invoice.update({where:{id:row.id},data:{outstandingAmount:Number(row.expected),status:row.status}});
    else if(row.kind==='RECEIPT')await tx.receipt.update({where:{id:row.id},data:{advanceAmount:Number(row.expected)}});
    else await tx.partyNote.update({where:{id:row.id},data:{remainingAmount:row.expected}});
    await tx.auditLog.create({data:{userId:actorId,action:'OUTSTANDING_RECALCULATED',details:JSON.stringify({id:row.id,kind:row.kind,customerId:row.customerId,before:row.stored,after:row.expected,statusBefore:row.statusBefore,statusAfter:row.status})}});
   }
   for(const wallet of preview.wallets){
    await tx.customer.update({where:{id:wallet.id},data:{creditBalance:Number(wallet.expected)}});
    await tx.auditLog.create({data:{userId:actorId,action:'PARTY_CREDIT_CACHE_RECALCULATED',details:JSON.stringify({customerId:wallet.id,before:wallet.stored,after:wallet.expected})}});
   }
   return {checked:preview.checked,changed:preview.changes.length,walletsChanged:preview.wallets.length};
  });
 }
 private async letterData(tx:Prisma.TransactionClient,input:LetterFilters) {
  const { threshold: _threshold, includePrinted: _printed, ...filters }=input;
  const report=partyReportQuery.parse({...filters,kind:'bill',showCredit:'true'});
  const query=await reportQuery(tx,report,DEFAULT_AGE_LIMITS);
  const rows=await tx.$queryRaw<BillRow[]>(Prisma.sql`SELECT b.* FROM (${query}) b JOIN "Customer" c ON c.id=b."customerId"
    WHERE c."partyStatus" IN ('CUSTOMER','DEALER') AND b.net>${new Prisma.Decimal(input.threshold)}
    ${input.includePrinted?Prisma.empty:Prisma.sql`AND NOT EXISTS(SELECT 1 FROM "OutstandingLetter" l WHERE l."customerId"=b."customerId" AND l."printedAt" IS NOT NULL ${input.branchId?Prisma.sql`AND l."branchId"=${input.branchId}`:Prisma.empty})`}
    ORDER BY b."sortKey",b."customerId",b.date,b.number,b.id LIMIT 10001`);
  if(rows.length>10000)throw new BadRequestError('Select a narrower range; a letter run supports 10000 bill rows');
  if(rows.some(r=>r.balance.isNegative()))throw new ConflictError('An account has invalid allocations. Reconcile it before generating letters');
  const ids=[...new Set(rows.map(r=>r.customerId))];
  if(ids.length>100)throw new BadRequestError('Select a narrower range; generate at most 100 parties per run');
  const selectedBranch=input.branchId?await tx.branch.findUniqueOrThrow({where:{id:input.branchId}}):undefined;
  const customers=await tx.customer.findMany({where:{id:{in:ids}},include:{branch:true}});
  const settings=await this.settings(tx);
  const parties=ids.map(id=>{const customer=customers.find(c=>c.id===id)!;const bills=rows.filter(r=>r.customerId===id);return {customer,bills,branch:selectedBranch??customer.branch,net:bills[0].net};});
  return {parties,settings,previewHash:hash({input,parties,settings})};
 }
 async previewLetters(input:LetterFilters){
  return prisma.$transaction(async tx=>{const data=await this.letterData(tx,input);return {previewHash:data.previewHash,parties:data.parties.map(p=>({id:p.customer.id,code:p.customer.code,name:p.customer.companyName||p.customer.firstName+' '+p.customer.lastName,net:p.net,bills:p.bills.filter(b=>b.side==='DEBIT').length}))};},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async generate(input:LetterFilters,previewHash:string,key:string,actorId:string){
  const requestHash=hash({input,previewHash,actorId});
  return withPartyTransaction(async tx=>{
   await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`);
   const previous=await tx.outstandingLetter.findMany({where:{requestKey:{startsWith:key+':' }},orderBy:{reference:'asc'}});
   if(previous.length){if(previous.some(l=>l.requestHash!==requestHash))throw new ConflictError('Request key was reused with different letter details');return previous;}
   const data=await this.letterData(tx,input);
   if(data.previewHash!==previewHash)throw new ConflictError('Letter balances or settings changed. Preview again');
   const letters=[];
   for(const party of data.parties){
    const customer=party.customer;
    const address=[customer.house,customer.street,customer.address,customer.city,customer.state,customer.country].filter(Boolean).join(', ');
    const name=customer.companyName||customer.firstName+' '+customer.lastName;
    const sequence=await tx.documentSequence.upsert({where:{key:'OUTSTANDING_LETTER_'+data.settings.letterPrefix},create:{key:'OUTSTANDING_LETTER_'+data.settings.letterPrefix,value:1},update:{value:{increment:1}}});
    if(sequence.value>999999)throw new ConflictError('Letter reference series is exhausted; configure a new prefix');
    const reference=data.settings.letterPrefix+String(sequence.value).padStart(6,'0');
    const table='<table><thead><tr><th>Document</th><th>Date</th><th>Amount NGN</th><th>Adjusted NGN</th><th>Balance NGN</th></tr></thead><tbody>'+party.bills.map(b=>'<tr><td>'+escapeLetter(b.number)+(b.side==='CREDIT'?' (available credit)':'')+'</td><td>'+escapeLetter(lagosDay(b.date))+'</td><td>'+b.amount.toFixed(2)+'</td><td>'+b.adjusted.toFixed(2)+'</td><td>'+b.balance.toFixed(2)+'</td></tr>').join('')+'</tbody></table>';
    const values:Record<string,string>={customerName:escapeLetter(name),address:escapeLetter(address),asOn:escapeLetter(input.asOn),totalOutstanding:party.net.toFixed(2),billTable:table};
    const content=escapeLetter(data.settings.letterTemplate).replace(/\n/g,'<br>').replace(/{{(\w+)}}/g,(_,key:string)=>values[key]);
    const snapshot=JSON.parse(JSON.stringify({name,code:customer.code,address,branch:party.branch,bills:party.bills,template:data.settings.letterTemplate}));
    const letter=await tx.outstandingLetter.create({data:{reference,customerId:customer.id,branchId:input.branchId??customer.branchId,asOn:reportStart(input.asOn),totalOutstanding:party.net,snapshot,content,requestKey:key+':'+customer.id,requestHash,createdById:actorId}});
    letters.push(letter);
    await tx.auditLog.create({data:{userId:actorId,action:'OUTSTANDING_LETTER_GENERATED',details:JSON.stringify({letterId:letter.id,reference,customerId:customer.id,asOn:input.asOn,net:party.net})}});
   }
   return letters;
  });
 }
 async saved(input:{branchId?:string;fromRef?:string;toRef?:string;page:number}){
  const where:Prisma.OutstandingLetterWhereInput={...(input.branchId?{branchId:input.branchId}:{}),reference:{gte:input.fromRef,lte:input.toRef}};
  const [letters,total]=await Promise.all([prisma.outstandingLetter.findMany({where,orderBy:{reference:'asc'},skip:(input.page-1)*25,take:25}),prisma.outstandingLetter.count({where})]);
  return {letters,meta:{page:input.page,pageSize:25,total,totalPages:Math.ceil(total/25)}};
 }
 async letters(ids:string[],branchId?:string,tx:Prisma.TransactionClient=prisma){
  const letters=await tx.outstandingLetter.findMany({where:{id:{in:ids},...(branchId?{branchId}:{})},orderBy:{reference:'asc'}});
  if(letters.length!==new Set(ids).size)throw new NotFoundError('A letter is unavailable in this branch');
  return letters;
 }
 async markPrinted(ids:string[],actorId:string,branchId?:string){
  return withPartyTransaction(async tx=>{
   const letters=await this.letters(ids,branchId,tx);
   const now=new Date();
   const pending=letters.filter(l=>!l.printedAt);
   if(pending.length)await tx.outstandingLetter.updateMany({where:{id:{in:pending.map(l=>l.id)},printedAt:null},data:{printedAt:now,printedById:actorId}});
   for(const letter of pending)await tx.auditLog.create({data:{userId:actorId,action:'OUTSTANDING_LETTER_PRINTED',details:JSON.stringify({id:letter.id,reference:letter.reference,printedAt:now})}});
   return {marked:pending.length};
  });
 }
}
