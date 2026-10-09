import type {Request,Response,NextFunction,RequestHandler} from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { ROLES,PERMISSIONS } from '../../shared/constants/roles';
import { ForbiddenError,NotFoundError } from '../../shared/errors/appError';
import { PartyAccountService } from './party-account.service';
import { PartyNoteService } from './party-note.service';
import { noteRegisterQuery } from './party-note.validation';
import { escapeReportText,writeReport } from './party-report.controller';

export function noteScope(req:Request,branchId?:string){
 if(req.user?.role===ROLES.ADMIN||req.user?.role===ROLES.SUPER_ADMIN)return branchId;
 if(!req.user?.branchId)throw new ForbiddenError('Your account must be assigned to a branch');
 if(branchId&&branchId!==req.user.branchId)throw new ForbiddenError('You can only access your own branch');
 return req.user.branchId;
}
export function assertNotePermission(req:Request,direction:string,action:'read'|'create'|'cancel'|'register'){
 const permission=action==='register'?'report:'+(direction==='DEBIT'?'debit':'credit')+'-note-register':(direction==='DEBIT'?'debitnote':'creditnote')+':'+action;
 if(!req.user?.permissions?.includes(permission))throw new ForbiddenError('You do not have the required note permission');
}
export const requireNoteCreate:RequestHandler=(req,_res,next)=>{assertNotePermission(req,req.body.direction,'create');next();};
export const requireNoteRead:RequestHandler=(req,_res,next)=>{assertNotePermission(req,req.query.direction as string,'read');next();};
export const requireNoteRegister:RequestHandler=(req,_res,next)=>{assertNotePermission(req,req.query.direction as string,'register');next();};
export const requireAnyNoteCreate:RequestHandler=(req,_res,next)=>{
 if(!req.user?.permissions?.some(p=>p===PERMISSIONS.DEBIT_NOTE_CREATE||p===PERMISSIONS.CREDIT_NOTE_CREATE))throw new ForbiddenError('Note creation permission is required');
 next();
};
type Note=Awaited<ReturnType<PartyNoteService['get']>>;
const noteTitle=(direction:string)=>direction==='DEBIT'?'Debit Note':'Credit Note';
const columns=(direction:string)=>['Number','Date',...(direction==='DEBIT'?['Type']:[]),'Customer code','Customer','Narration',direction==='DEBIT'?'Linked receipts':'Account lines','Amount',direction==='DEBIT'?'Outstanding':'Unadjusted','Status','Tally voucher'];
const displayDate=(date:Date)=>new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos'}).format(date);
const values=(n:Note):Array<string|number>=>[n.number,displayDate(n.date),...(n.direction==='DEBIT'?[n.type]:[]),n.partyCode??n.customer.code??'',n.partyName??n.customer.companyName??n.customer.firstName+' '+n.customer.lastName,n.narration,n.direction==='DEBIT'?n.receiptLines.map(l=>l.receiptNumber+': '+l.amount.toFixed(2)).join('; '):n.accountLines.map(l=>l.accountCode+' '+l.accountName+': '+l.amount.toFixed(2)).join('; '),Number(n.amount),Number(n.remainingAmount),n.status,n.tallyVoucherNo??''];
export class PartyNoteController{
 private service=new PartyNoteService();
 private input(req:Request){const input=noteRegisterQuery.parse(req.query);return {...input,branchId:noteScope(req,input.branchId)};}
 private async accessible(req:Request,action:'read'|'cancel'){
  const note=await this.service.get(req.params.id);assertNotePermission(req,note.direction,action);noteScope(req,note.branchId);return note;
 }
 create=async(req:Request,res:Response,next:NextFunction)=>{try{noteScope(req,req.body.branchId);const note=await this.service.create(req.body,req.user!.userId);res.status(201).json({status:'success',statusCode:201,data:{note}});}catch(e){next(e);}};
 get=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',data:{note:await this.accessible(req,'read')}});}catch(e){next(e);}};
 cancel=async(req:Request,res:Response,next:NextFunction)=>{try{const note=await this.accessible(req,'cancel');res.json({status:'success',data:{note:await this.service.cancel(note.id,req.body.remark,req.user!.userId,noteScope(req,note.branchId))}});}catch(e){next(e);}};
 parties=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',data:{customers:await new PartyAccountService().search(noteScope(req,req.query.branchId as string),req.query.search as string,req.query.order as 'name'|'code',Number(req.query.limit))}});}catch(e){next(e);}};
 customer=async(req:Request,res:Response,next:NextFunction)=>{try{const c=await prisma.customer.findUnique({where:{id:req.params.id},select:{id:true,code:true,branchId:true,mergedIntoId:true,type:true,firstName:true,lastName:true,companyName:true,house:true,street:true,address:true,city:true,state:true}});if(!c||c.mergedIntoId||c.type.toUpperCase()==='VENDOR')throw new NotFoundError('Customer not found');noteScope(req,c.branchId);res.json({status:'success',data:{customer:c}});}catch(e){next(e);}};
 receipts=async(req:Request,res:Response,next:NextFunction)=>{try{assertNotePermission(req,'DEBIT','create');const branchId=noteScope(req,req.query.branchId as string)!;res.json({status:'success',data:await this.service.receipts(req.query.customerId as string,branchId,req.query.search as string,Number(req.query.page))});}catch(e){next(e);}};
 ledgers=async(req:Request,res:Response,next:NextFunction)=>{try{assertNotePermission(req,'CREDIT','create');const search=req.query.search as string;res.json({status:'success',data:{ledgers:await prisma.tallyLedger.findMany({where:{active:true,...(search?{OR:[{code:{contains:search,mode:'insensitive'}},{name:{contains:search,mode:'insensitive'}}]}:{})},orderBy:{code:'asc'},take:Number(req.query.limit)})}});}catch(e){next(e);}};
 register=async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',data:await this.service.register(this.input(req))});}catch(e){next(e);}};
 export=async(req:Request,res:Response,next:NextFunction)=>{try{
  const input=this.input(req);const headings=columns(input.direction);
  res.setHeader('Content-Type','application/vnd.ms-excel; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="dana-'+input.direction.toLowerCase()+'-note-register.xml"');res.setHeader('Cache-Control','no-store');
  const row=(cells:Array<string|number>)=>'<Row>'+cells.map(v=>'<Cell><Data ss:Type="'+(typeof v==='number'?'Number':'String')+'">'+escapeReportText(v)+'</Data></Cell>').join('')+'</Row>';
  await writeReport(res,'<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Note register"><Table>'+row(headings));
  let amount=new Prisma.Decimal(0),remaining=new Prisma.Decimal(0);
  await this.service.stream(input,async notes=>{for(const n of notes){amount=amount.plus(n.amount);remaining=remaining.plus(n.remainingAmount);await writeReport(res,row(values(n)));}});
  const total=headings.map((h,i)=>i===0?'TOTAL':h==='Amount'?Number(amount):h==='Outstanding'||h==='Unadjusted'?Number(remaining):'');
  res.end(row(total)+'</Table></Worksheet></Workbook>');
 }catch(e){if(res.headersSent)res.destroy(e instanceof Error?e:undefined);else next(e);}};
 printRegister=async(req:Request,res:Response,next:NextFunction)=>{try{
  const input=this.input(req);res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  await writeReport(res,this.printHead(noteTitle(input.direction)+' Register')+'<p>'+escapeReportText(input.from)+' to '+escapeReportText(input.to)+'</p><table><thead><tr>'+columns(input.direction).map(h=>'<th>'+escapeReportText(h)+'</th>').join('')+'</tr></thead><tbody>');
  let total=new Prisma.Decimal(0),remaining=new Prisma.Decimal(0),count=0;
  await this.service.stream(input,async notes=>{for(const n of notes){count++;total=total.plus(n.amount);remaining=remaining.plus(n.remainingAmount);await writeReport(res,'<tr>'+values(n).map(v=>'<td>'+escapeReportText(typeof v==='number'?v.toFixed(2):v)+'</td>').join('')+'</tr>');}});
  res.end('</tbody></table>'+(count?'':'<p>No notes match these filters.</p>')+'<p>Total amount: '+total.toFixed(2)+' NGN · Remaining: '+remaining.toFixed(2)+' NGN</p></body></html>');
 }catch(e){if(res.headersSent)res.destroy(e instanceof Error?e:undefined);else next(e);}};
 print=async(req:Request,res:Response,next:NextFunction)=>{try{
  const n=await this.accessible(req,'read');res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const lines=n.direction==='DEBIT'?n.receiptLines.map(l=>[l.receiptNumber,displayDate(l.receiptDate),l.chequeNumber??'',l.receiptAmount.toFixed(2),l.narration,l.amount.toFixed(2)]):n.accountLines.map(l=>[l.accountCode,l.accountName,l.narration,l.amount.toFixed(2)]);
  const headers=n.direction==='DEBIT'?['Receipt','Date','Cheque','Receipt amount','Narration','Debit amount']:['Account code','Account','Narration','Amount'];
  res.send(this.printHead(noteTitle(n.direction))+'<p><strong>'+escapeReportText(n.number)+'</strong> · '+displayDate(n.date)+' · '+escapeReportText(n.branch.name)+' · '+escapeReportText(n.status)+'</p><h2>'+escapeReportText(n.partyName??n.customer.companyName??n.customer.firstName+' '+n.customer.lastName)+'</h2><p>'+[n.partyCode,n.partyAddress,n.partyCity,n.partyState].filter(Boolean).map(escapeReportText).join(' · ')+'</p><p>'+escapeReportText(n.narration)+'</p>'+(lines.length?'<table><thead><tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+lines.map(l=>'<tr>'+l.map(v=>'<td>'+escapeReportText(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>':'')+'<p><strong>Total '+n.amount.toFixed(2)+' NGN</strong> · Remaining '+n.remainingAmount.toFixed(2)+' NGN</p>'+(n.cancelRemark?'<p>Cancellation: '+escapeReportText(n.cancelRemark)+'</p>':'')+'<p>Tally voucher: '+escapeReportText(n.tallyVoucherNo??'Not posted')+'</p></body></html>');
 }catch(e){next(e);}};
 private printHead(title:string){return '<!doctype html><html><head><meta charset="utf-8"><title>'+title+'</title><style>body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1{font-size:22px}h2{font-size:16px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #dce2ea;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:14mm}</style></head><body><h1>Dana Motors · '+title+'</h1>';}
}
