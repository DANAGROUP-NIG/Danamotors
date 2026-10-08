
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { NotFoundError } from '../../shared/errors/appError';
import { withPartyTransaction } from './party-account.service';
import { DEFAULT_AGE_LIMITS, ageLimitsSchema, type PartyReportInput } from './party-report.validation';
import { reportEnd,reportStart } from './party-report';
export type ReportRow={customerId:string;code:string|null;name:string;[key:string]:string|number|null};
type RawRow={ [key:string]:string|number|bigint|Date|Prisma.Decimal|null };
const normalize=(row:RawRow):ReportRow => Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Prisma.Decimal?Number(v):v instanceof Date?v.toISOString():typeof v==='bigint'?Number(v):v])) as ReportRow;
const nameSql=Prisma.sql`COALESCE(NULLIF(c."companyName",''),TRIM(c."firstName" || ' ' || c."lastName"))`;

async function partyScope(tx:Prisma.TransactionClient,input:PartyReportInput) {
 const order=input.order==='code'?Prisma.sql`COALESCE(c.code,'')`:Prisma.sql`LOWER(${nameSql})`;
 const filters=[Prisma.sql`c."mergedIntoId" IS NULL AND UPPER(c.type)<>'VENDOR'`];
 if(input.customerId) filters.push(Prisma.sql`c.id=${input.customerId}`);
 if(input.partyStatus!=='ALL')filters.push(Prisma.sql`c."partyStatus"=${input.partyStatus}`);
 for(const [id,lower] of [[input.fromCustomerId,true],[input.toCustomerId,false]] as const){
  if(!id)continue;
  const bounds=await tx.$queryRaw<Array<{value:string;id:string}>>(Prisma.sql`SELECT ${order} value,c.id FROM "Customer" c WHERE c.id=${id} AND c."mergedIntoId" IS NULL AND UPPER(c.type)<>'VENDOR'
   ${input.branchId?Prisma.sql`AND (c."branchId"=${input.branchId} OR EXISTS(SELECT 1 FROM "PartyReportDocument" d WHERE d."customerId"=c.id AND d."branchId"=${input.branchId}))`:Prisma.empty}`);
  if(!bounds.length)throw new NotFoundError('Party range endpoint is unavailable in this branch');
  filters.push(lower?Prisma.sql`(${order},c.id)>=(${bounds[0].value},${id})`:Prisma.sql`(${order},c.id)<=(${bounds[0].value},${id})`);
 }
 return {order,where:Prisma.join(filters,' AND ')};
}
async function reportQuery(tx:Prisma.TransactionClient,input:PartyReportInput,limits:number[]) {
 const {order,where}=await partyScope(tx,input);
 const end=reportEnd(input.kind==='ledger'?input.to!:input.asOn!);
 const branch=input.branchId?Prisma.sql`AND d."branchId"=${input.branchId}`:Prisma.empty;
 const parties=Prisma.sql`parties AS (SELECT c.id "customerId",c.code,${nameSql} name,${order} "sortKey" FROM "Customer" c WHERE ${where})`;
 if(input.kind==='ledger'){
  const start=reportStart(input.from!);
  return Prisma.sql`WITH ${parties}, events AS (
   SELECT d.*,p.code,p.name,p."sortKey" FROM "PartyReportEvent" d JOIN parties p ON p."customerId"=d."customerId" WHERE d.date<${end} ${branch}),
   balances AS (SELECT *,SUM(debit-credit) OVER(PARTITION BY "customerId" ORDER BY date,number,id ROWS UNBOUNDED PRECEDING) "runningBalance",
    COALESCE(SUM(debit-credit) FILTER(WHERE date<${start}) OVER(PARTITION BY "customerId"),0) opening,
    SUM(debit-credit) OVER(PARTITION BY "customerId") closing FROM events),
   rows AS (SELECT "customerId",code,name,id,number,kind,date,narration,debit,credit,"runningBalance",opening,closing,"sortKey",0 "rowOrder" FROM balances WHERE date>=${start}
    UNION ALL SELECT p."customerId",p.code,p.name,'OPENING:' || p."customerId",'', 'BALANCE',${start}::timestamp,'No transactions in this period',0::numeric,0::numeric,COALESCE(SUM(e.debit-e.credit),0),COALESCE(SUM(e.debit-e.credit),0),COALESCE(SUM(e.debit-e.credit),0),p."sortKey",0
    FROM parties p JOIN events e ON e."customerId"=p."customerId" GROUP BY p."customerId",p.code,p.name,p."sortKey" HAVING MAX(e.date)<${start}) SELECT * FROM rows`;
 }
 const asDate=new Date(input.asOn!+'T00:00:00.000Z');
 const bucketColumns=limits.map((limit,i)=>Prisma.sql`COALESCE(SUM(balance) FILTER(WHERE side='DEBIT' AND age>${i?limits[i-1]:-1} AND age<=${limit}),0) AS ${Prisma.raw('"bucket'+i+'"')}`);
 bucketColumns.push(Prisma.sql`COALESCE(SUM(balance) FILTER(WHERE side='DEBIT' AND age>${limits[4]}),0) AS "bucket5"`);
 const base=Prisma.sql`WITH ${parties}, documents AS (
 SELECT d.*,p.code,p.name,p."sortKey",CASE WHEN d.kind IN ('INVOICE','DEBIT_NOTE') THEN 'DEBIT' ELSE 'CREDIT' END side,
 d.amount+CASE WHEN d.kind='RECEIPT' THEN COALESCE((SELECT SUM(ROUND(e."newAmount"::numeric,2)-ROUND(e."oldAmount"::numeric,2)) FROM "ReceiptEditLog" e WHERE e."receiptId"=d.id AND e."createdAt"<${end}),0) ELSE 0 END "asOnAmount",
 GREATEST(0,(${asDate}::date-(d.date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Lagos')::date)) age
 FROM "PartyReportDocument" d JOIN parties p ON p."customerId"=d."customerId"
 WHERE d.date<${end} AND (d."cancelledAt" IS NULL OR d."cancelledAt">=${end}) ${branch}),
 adjustments AS (
 SELECT 'INVOICE'::text kind,a."invoiceId" id,SUM(ROUND(a.amount::numeric,2)) amount FROM "ReceiptAllocation" a JOIN documents d ON d.kind='INVOICE' AND d.id=a."invoiceId" WHERE a."invoiceId" IS NOT NULL AND a."adjustedAt"<${end} AND (a."reversedAt" IS NULL OR a."reversedAt">=${end}) GROUP BY a."invoiceId"
 UNION ALL SELECT 'DEBIT_NOTE',a."debitNoteId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN documents d ON d.kind='DEBIT_NOTE' AND d.id=a."debitNoteId" WHERE a."debitNoteId" IS NOT NULL AND a."adjustedAt"<${end} AND (a."reversedAt" IS NULL OR a."reversedAt">=${end}) GROUP BY a."debitNoteId"
 UNION ALL SELECT 'RECEIPT',a."receiptId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN documents d ON d.kind='RECEIPT' AND d.id=a."receiptId" WHERE a."receiptId" IS NOT NULL AND a."adjustedAt"<${end} AND (a."reversedAt" IS NULL OR a."reversedAt">=${end}) GROUP BY a."receiptId"
 UNION ALL SELECT 'CREDIT_NOTE',a."creditNoteId",SUM(ROUND(a.amount::numeric,2)) FROM "ReceiptAllocation" a JOIN documents d ON d.kind='CREDIT_NOTE' AND d.id=a."creditNoteId" WHERE a."creditNoteId" IS NOT NULL AND a."adjustedAt"<${end} AND (a."reversedAt" IS NULL OR a."reversedAt">=${end}) GROUP BY a."creditNoteId"),
 balances AS (SELECT d.*,COALESCE(a.amount,0) adjusted,d."asOnAmount"-COALESCE(a.amount,0) balance FROM documents d LEFT JOIN adjustments a ON a.kind=d.kind AND a.id=d.id),
 totals AS (SELECT "customerId",code,name,"sortKey",COALESCE(SUM(balance) FILTER(WHERE side='DEBIT'),0) debits,COALESCE(SUM(balance) FILTER(WHERE side='CREDIT'),0) credits,
 SUM(CASE WHEN side='DEBIT' THEN balance ELSE -balance END) net,${Prisma.join(bucketColumns)} FROM balances GROUP BY "customerId",code,name,"sortKey")`;
 const hideCredit=input.kind!=='outstanding'&&input.showCredit!=='true';
 if(input.kind==='bill')return Prisma.sql`${base} SELECT b."customerId",b.code,b.name,b.id,b.number,b.kind,b.side,b.date,b."asOnAmount" amount,b.adjusted,b.balance,b.age,t.net,b."sortKey",CASE WHEN b.side='DEBIT' THEN 0 ELSE 1 END "rowOrder" FROM balances b JOIN totals t ON t."customerId"=b."customerId" WHERE b.balance<>0 ${hideCredit?Prisma.sql`AND t.net>=0`:Prisma.empty}`;
 return Prisma.sql`${base} SELECT t.*,0 "rowOrder" FROM totals t ${hideCredit?Prisma.sql`WHERE t.net>=0`:Prisma.empty}`;
}
const sorted=(query:Prisma.Sql,input:PartyReportInput)=>Prisma.sql`SELECT * FROM (${query}) report ORDER BY "sortKey","customerId","rowOrder" ${input.kind==='ledger'||input.kind==='bill'?Prisma.sql`,date,number,id`:Prisma.empty}`;

export class PartyReportService {
 async settings(){const value=await prisma.financeSetting.findUnique({where:{key:'partyAgeLimits'}});return {ageLimits:ageLimitsSchema.parse(value?.value??DEFAULT_AGE_LIMITS)};}
 async saveSettings(ageLimits:number[],actorId:string){ageLimitsSchema.parse(ageLimits);return withPartyTransaction(async tx=>{
  await tx.financeSetting.upsert({where:{key:'partyAgeLimits'},create:{key:'partyAgeLimits',value:ageLimits},update:{value:ageLimits}});
  await tx.auditLog.create({data:{userId:actorId,action:'PARTY_REPORT_SETTINGS_UPDATED',details:JSON.stringify({ageLimits})}});return {ageLimits};
 });}
 async search(branchId:string|undefined,search:string,order:'name'|'code',limit:number){
  const term='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  return prisma.$queryRaw<Array<{id:string;code:string|null;name:string}>>(Prisma.sql`SELECT c.id,c.code,${nameSql} name FROM "Customer" c
   WHERE c."mergedIntoId" IS NULL AND UPPER(c.type)<>'VENDOR' AND (${nameSql} ILIKE ${term} OR c.code ILIKE ${term})
   ${branchId?Prisma.sql`AND (c."branchId"=${branchId} OR EXISTS(SELECT 1 FROM "PartyReportDocument" d WHERE d."customerId"=c.id AND d."branchId"=${branchId}))`:Prisma.empty}
   ORDER BY ${order==='code'?Prisma.sql`COALESCE(c.code,'')`:Prisma.sql`LOWER(${nameSql})`},c.id LIMIT ${limit}`);
 }
 async report(input:PartyReportInput){const limits=input.ageLimits??(await this.settings()).ageLimits;
  return prisma.$transaction(async tx=>{
   const query=await reportQuery(tx,input,limits);
   const ageTotals=input.kind==='age'?Prisma.sql`,${Prisma.join(Array.from({length:6},(_,i)=>Prisma.sql`COALESCE(SUM(${Prisma.raw('bucket'+i)}),0) AS ${Prisma.raw('bucket'+i)}`))}`:Prisma.empty;
   const aggregates=input.kind==='ledger'?Prisma.sql`COALESCE(SUM(debit),0) debit,COALESCE(SUM(credit),0) credit`:input.kind==='bill'?Prisma.sql`COALESCE(SUM(balance) FILTER(WHERE side='DEBIT'),0) debits,COALESCE(SUM(balance) FILTER(WHERE side='CREDIT'),0) credits,COALESCE(SUM(CASE WHEN side='DEBIT' THEN balance ELSE -balance END),0) net`:Prisma.sql`COALESCE(SUM(debits),0) debits,COALESCE(SUM(credits),0) credits,COALESCE(SUM(net),0) net`;
   const summary=await tx.$queryRaw<RawRow[]>(Prisma.sql`SELECT COUNT(*) total,${aggregates}${ageTotals} FROM (${query}) report`);
   const rows=await tx.$queryRaw<RawRow[]>(Prisma.sql`${sorted(query,input)} LIMIT ${input.pageSize} OFFSET ${(input.page-1)*input.pageSize}`);
   const total=Number(summary[0].total);return {rows:rows.map(normalize),totals:normalize(summary[0]),ageLimits:limits,meta:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize)}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:15000});
 }
 async stream(input:PartyReportInput,consume:(rows:ReportRow[])=>Promise<void>){const limits=input.ageLimits??(await this.settings()).ageLimits;
  // One snapshot for all chunks. Fixed batches bound memory even on large exports.
  await prisma.$transaction(async tx=>{
   const query=sorted(await reportQuery(tx,input,limits),input);
   await tx.$executeRawUnsafe('DECLARE party_report_cursor NO SCROLL CURSOR FOR '+query.text,...query.values);
   for(;;){const rows=await tx.$queryRawUnsafe<RawRow[]>('FETCH FORWARD 500 FROM party_report_cursor');if(!rows.length)break;await consume(rows.map(normalize));}
   await tx.$executeRawUnsafe('CLOSE party_report_cursor');
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:120000});
 }
}
