
import type { Request,Response,NextFunction,RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ROLES,PERMISSIONS } from '../../shared/constants/roles';
import { ForbiddenError } from '../../shared/errors/appError';
import { PartyReportService,type ReportRow } from './party-report.service';
import { partyReportQuery, type PartyReportInput } from './party-report.validation';
export const PARTY_REPORT_PERMISSIONS={
 ledger:PERMISSIONS.PARTY_LEDGER_READ,outstanding:PERMISSIONS.PARTY_OUTSTANDING_READ,age:PERMISSIONS.PARTY_OUTSTANDING_AGE_READ,bill:PERMISSIONS.PARTY_OUTSTANDING_BILL_READ,
};
export const requirePartyReport:RequestHandler=(req,_res,next)=>{
 const kind=(req.query.kind??'outstanding') as keyof typeof PARTY_REPORT_PERMISSIONS;
 const allowed=kind?req.user?.permissions?.includes(PARTY_REPORT_PERMISSIONS[kind]):Object.values(PARTY_REPORT_PERMISSIONS).some(p=>req.user?.permissions?.includes(p));
 if(!allowed)throw new ForbiddenError('You do not have the required report permission');
 next();
};
export const requireAnyPartyReport:RequestHandler=(req,res,next)=>{
 if(req.query.kind!==undefined)return requirePartyReport(req,res,next);
 if(!Object.values(PARTY_REPORT_PERMISSIONS).some(p=>req.user?.permissions?.includes(p)))throw new ForbiddenError('You do not have the required report permission');
 next();
};
function scope(req:Request,branchId?:string){
 if(req.user?.role===ROLES.ADMIN||req.user?.role===ROLES.SUPER_ADMIN)return branchId;
 if(!req.user?.branchId)throw new ForbiddenError('Your account must be assigned to a branch');
 if(branchId&&branchId!==req.user.branchId)throw new ForbiddenError('You can only access your own branch');
 return req.user.branchId;
}
export function reportColumns(input:PartyReportInput){
 const base=[['code','Party code'],['name','Party name']];
 if(input.kind==='ledger')return [...base,['date','Date'],['number','Document'],['kind','Type'],['narration','Narration'],['opening','Opening'],['debit','Debit'],['credit','Credit'],['runningBalance','Running balance'],['closing','Closing']];
 if(input.kind==='bill')return [...base,['side','Side'],['date','Date'],['number','Document'],['kind','Type'],['amount','Amount'],['adjusted','Adjusted'],['balance','Outstanding / credit'],['age','Days old'],['net','Party net']];
 if(input.kind==='age'){const limits=input.ageLimits!;return [...base,...limits.map((n,i)=>['bucket'+i,(i?limits[i-1]+1:0)+'–'+n+' days']),['bucket5','Over '+limits[4]+' days'],['debits','Outstanding debits'],['credits','Unadjusted credits'],['net','Net outstanding']];}
 return [...base,['debits','Outstanding debits'],['credits','Unadjusted credits'],['net','Net outstanding']];
}
export const escapeReportText=(value:unknown)=>String(value??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
async function write(res:Response,value:string){
 if(res.destroyed)throw new Error('Report download disconnected');
 if(!res.write(value))await new Promise<void>((resolve,reject)=>{const clean=()=>{res.off('drain',drain);res.off('close',close);};const drain=()=>{clean();resolve();};const close=()=>{clean();reject(new Error('Report download disconnected'));};res.once('drain',drain);res.once('close',close);});
}
const titles={ledger:'Party Ledger',outstanding:'Party Outstanding',age:'Age-wise Party Outstanding',bill:'Bill-wise Party Outstanding'};
export class PartyReportController{
 private service=new PartyReportService();
 private input(req:Request){const input=partyReportQuery.parse(req.query);return {...input,branchId:scope(req,input.branchId)};}
 report=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',statusCode:200,data:await this.service.report(this.input(req))});}catch(e){next(e);}};
 search=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',statusCode:200,data:{customers:await this.service.search(scope(req,req.query.branchId as string|undefined),req.query.search as string,req.query.order as 'name'|'code',Number(req.query.limit))}});}catch(e){next(e);}};
 settings=async(_req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',statusCode:200,data:await this.service.settings()});}catch(e){next(e);}};
 saveSettings=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',statusCode:200,data:await this.service.saveSettings(req.body.ageLimits,req.user!.userId)});}catch(e){next(e);}};
 export=async(req:Request,res:Response,next:NextFunction)=>{try{
  const input=this.input(req);input.ageLimits??=(await this.service.settings()).ageLimits;const columns=reportColumns(input);
  res.setHeader('Content-Type','application/vnd.ms-excel; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="dana-party-'+input.kind+'.xml"');res.setHeader('Cache-Control','no-store');
  await write(res,'<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Money"><NumberFormat ss:Format="#,##0.00"/></Style></Styles><Worksheet ss:Name="Party report"><Table>');
  const xmlRow=(values:Array<string|number|null>)=>'<Row>'+values.map((v,i)=>'<Cell'+(typeof v==='number'&&columns[i]?.[0]!=='age'?' ss:StyleID="Money"':'')+'><Data ss:Type="'+(typeof v==='number'?'Number':'String')+'">'+escapeReportText(v)+'</Data></Cell>').join('')+'</Row>';
  await write(res,xmlRow(columns.map(c=>c[1])));
  const sums=new Map<string,Prisma.Decimal>();const additive=new Set(input.kind==='ledger'?['debit','credit']:input.kind==='bill'?['balance']:['debits','credits','net','bucket0','bucket1','bucket2','bucket3','bucket4','bucket5']);
  await this.service.stream(input,async rows=>{for(const row of rows){for(const key of additive)sums.set(key,(sums.get(key)??new Prisma.Decimal(0)).plus(input.kind==='bill'&&row.side==='CREDIT'?new Prisma.Decimal(row[key]??0).negated():row[key]??0));await write(res,xmlRow(columns.map(([key])=>key==='date'&&row[key]?new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos'}).format(new Date(String(row[key]))):row[key]??'')));}});
  await write(res,xmlRow(columns.map(([key],i)=>i===0?(input.kind==='bill'?'NET TOTAL':'TOTAL'):sums.has(key)?Number(sums.get(key)):'')));
  res.end('</Table></Worksheet></Workbook>');
 }catch(e){if(res.headersSent)res.destroy(e instanceof Error?e:undefined);else next(e);}};
 print=async(req:Request,res:Response,next:NextFunction)=>{try{
  const input=this.input(req);input.ageLimits??=(await this.service.settings()).ageLimits;const columns=reportColumns(input);const grouped=input.kind==='ledger'||input.kind==='bill';
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  await write(res,'<!doctype html><html><head><meta charset="utf-8"><title>'+titles[input.kind]+'</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1{font-size:20px}h2{font-size:15px}table{width:100%;border-collapse:collapse}th,td{padding:7px;border-bottom:1px solid #dce2ea;text-align:left}thead{display:table-header-group}.money{text-align:right;font-variant-numeric:tabular-nums}.party{break-before:page}.party:first-of-type{break-before:auto}tr{break-inside:avoid}@page{size:A4 landscape;margin:14mm}</style></head><body><h1>Dana Motors · '+titles[input.kind]+'</h1><p>'+escapeReportText(input.kind==='ledger'?input.from+' to '+input.to:'As on '+input.asOn)+' · '+escapeReportText(input.branchId?'Selected branch':'All branches')+'</p>');
  const table=()=>'<table><thead><tr>'+columns.map(c=>'<th>'+escapeReportText(c[1])+'</th>').join('')+'</tr></thead><tbody>';
  let party:string|undefined,last:ReportRow|undefined;const sums=new Map<string,Prisma.Decimal>();const additive=new Set(input.kind==='ledger'?['debit','credit']:input.kind==='bill'?['balance']:['debits','credits','net','bucket0','bucket1','bucket2','bucket3','bucket4','bucket5']);let count=0;
  const closeParty=async()=>{if(last)await write(res,'</tbody></table><p><strong>'+(input.kind==='ledger'?'Closing balance: '+escapeReportText(last.closing):'Party net: '+escapeReportText(last.net))+' NGN</strong></p></section>');};
  if(!grouped)await write(res,table());
  await this.service.stream(input,async rows=>{for(const row of rows){count++;if(grouped&&row.customerId!==party){await closeParty();party=row.customerId;await write(res,'<section class="party"><h2>'+escapeReportText(row.code)+' · '+escapeReportText(row.name)+'</h2>'+(input.kind==='ledger'?'<p>Opening balance: '+escapeReportText(row.opening)+' NGN</p>':'')+table());}
   for(const key of additive)sums.set(key,(sums.get(key)??new Prisma.Decimal(0)).plus(input.kind==='bill'&&row.side==='CREDIT'?new Prisma.Decimal(row[key]??0).negated():row[key]??0));
   await write(res,'<tr>'+columns.map(([key])=>'<td'+(typeof row[key]==='number'?' class="money"':'')+'>'+escapeReportText(typeof row[key]==='number'?new Intl.NumberFormat('en-NG',{minimumFractionDigits:key==='age'?0:2,maximumFractionDigits:key==='age'?0:2}).format(row[key] as number):key==='date'&&row[key]?new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos'}).format(new Date(String(row[key]))):row[key])+'</td>').join('')+'</tr>');last=row;
  }});
  if(grouped)await closeParty();else await write(res,'</tbody><tfoot><tr>'+columns.map(([key],i)=>'<th>'+escapeReportText(i===0?'TOTAL':sums.has(key)?sums.get(key)?.toFixed(2):'')+'</th>').join('')+'</tr></tfoot></table>');
  if(!count)await write(res,'<p>No records match these filters.</p>');res.end('</body></html>');
 }catch(e){if(res.headersSent)res.destroy(e instanceof Error?e:undefined);else next(e);}};
}

export { write as writeReport };
