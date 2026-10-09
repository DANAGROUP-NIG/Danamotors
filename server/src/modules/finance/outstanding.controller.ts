import { PartyReportService } from './party-report.service';
import type { Request,Response,NextFunction,RequestHandler } from 'express';
import { ROLES,PERMISSIONS } from '../../shared/constants/roles';
import { ForbiddenError,BadRequestError } from '../../shared/errors/appError';
import { OutstandingService,escapeLetter } from './outstanding.service';
import { maintenanceFilters,letterFilters } from './outstanding.validation';
import { writeReport } from './party-report.controller';
export function outstandingScope(req:Request,branchId?:string){
 if(req.user?.role===ROLES.ADMIN||req.user?.role===ROLES.SUPER_ADMIN)return branchId;
 if(!req.user?.branchId)throw new ForbiddenError('Your account must be assigned to a branch');
 if(branchId&&branchId!==req.user.branchId)throw new ForbiddenError('You can only access your own branch');
 return req.user.branchId;
}
export const requireOutstandingTools:RequestHandler=(req,_res,next)=>{
 const admin=req.user?.role===ROLES.ADMIN||req.user?.role===ROLES.SUPER_ADMIN;
 if(req.user?.role!==ROLES.SUPER_ADMIN&&!req.user?.permissions.includes(PERMISSIONS.OUTSTANDING_LETTER)&&!(admin&&req.user?.permissions.includes(PERMISSIONS.OUTSTANDING_RECALCULATE)))throw new ForbiddenError('You do not have the required outstanding permission');
 next();
};
export class OutstandingController {
 private service=new OutstandingService();
 search=this.handle(req=>new PartyReportService().search(outstandingScope(req,req.query.branchId as string|undefined),req.query.search as string,req.query.order as 'name'|'code',Number(req.query.limit)).then(customers=>({customers})));
 private handle(work:(req:Request)=>Promise<unknown>){return async(req:Request,res:Response,next:NextFunction)=>{try{res.json({status:'success',statusCode:200,data:await work(req)});}catch(e){next(e);}};}
 previewRepair=this.handle(req=>{const input=maintenanceFilters.parse(req.body);return this.service.previewRepair({...input,branchId:outstandingScope(req,input.branchId)});});
 applyRepair=this.handle(req=>{const {previewHash,...body}=req.body;if(!previewHash)throw new BadRequestError('Preview is required');const input=maintenanceFilters.parse(body);return this.service.applyRepair({...input,branchId:outstandingScope(req,input.branchId)},previewHash,req.user!.userId);});
 settings=this.handle(()=>this.service.settings());
 saveSettings=this.handle(req=>this.service.saveSettings(req.body,req.user!.userId));
 previewLetters=this.handle(req=>{const input=letterFilters.parse(req.body);return this.service.previewLetters({...input,branchId:outstandingScope(req,input.branchId)});});
 generate=this.handle(req=>{const {idempotencyKey,previewHash,...body}=req.body;const input=letterFilters.parse(body);return this.service.generate({...input,branchId:outstandingScope(req,input.branchId)},previewHash,idempotencyKey,req.user!.userId);});
 saved=this.handle(req=>this.service.saved({...req.query as unknown as {fromRef?:string;toRef?:string;page:number},branchId:outstandingScope(req,req.query.branchId as string|undefined)}));
 markPrinted=this.handle(req=>this.service.markPrinted(req.body.ids,req.user!.userId,outstandingScope(req)));
 print=async(req:Request,res:Response,next:NextFunction)=>{try{
  const letters=await this.service.letters(req.body.ids,outstandingScope(req));
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  await writeReport(res,'<!doctype html><html><head><meta charset="utf-8"><title>Outstanding letters</title><style>@page{size:A4;margin:20mm}body{font:12px Arial;color:#172033}.letter{break-before:page}.letter:first-child{break-before:auto}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:8px;border:1px solid #dce2ea}thead{display:table-header-group}tr{break-inside:avoid}.heading{margin-bottom:24px}.body{line-height:1.6}</style></head><body>');
  for(const letter of letters){
   const snapshot=letter.snapshot as unknown as {name:string;branch:{name:string;address?:string;city?:string;state?:string;phoneNumber?:string;email?:string}};
   const branch=snapshot.branch;
   await writeReport(res,'<section class="letter"><div class="heading"><h1>Dana Motors</h1><p>'+escapeLetter([branch.name,branch.address,branch.city,branch.state].filter(Boolean).join(', '))+'<br>'+escapeLetter([branch.phoneNumber,branch.email].filter(Boolean).join(' · '))+'</p></div><p><strong>Reference '+escapeLetter(letter.reference)+'</strong><br>Generated '+escapeLetter(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(letter.createdAt))+'<br>As on '+escapeLetter(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos'}).format(letter.asOn))+'</p><div class="body">'+letter.content+'</div></section>');
  }
  res.end('</body></html>');
 }catch(e){if(res.headersSent)res.destroy(e instanceof Error?e:undefined);else next(e);}};
}

