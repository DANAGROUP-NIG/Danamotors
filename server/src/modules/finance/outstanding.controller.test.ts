jest.mock('../../prisma/client',()=>({__esModule:true,default:{}}));
import type {Request,Response,RequestHandler} from 'express';
import router from './finance.routes';
import {OutstandingController,outstandingScope} from './outstanding.controller';
import {OutstandingService} from './outstanding.service';
import {ROLES,PERMISSIONS} from '../../shared/constants/roles';
const request=(role:string,branchId:string|null='own',permissions:string[]=[PERMISSIONS.OUTSTANDING_LETTER])=>({user:{userId:'actor',role,branchId,permissions},query:{},body:{},params:{}} as unknown as Request);
const response=()=>({json:jest.fn()} as unknown as Response);
const handlers=(path:string)=>(router as unknown as {stack:Array<{route?:{path:string;stack:Array<{handle:RequestHandler}>}}>}).stack.find(l=>l.route?.path===path)!.route!.stack.map(l=>l.handle);
afterEach(()=>jest.restoreAllMocks());
it.each(['/outstanding/recalculate/preview','/outstanding/recalculate/apply'])('requires administrator role and repair permission on %s',path=>{
 expect(()=>handlers(path)[0](request(ROLES.ACCOUNTANT,'own',[PERMISSIONS.OUTSTANDING_RECALCULATE]),response(),jest.fn())).toThrow('required role');
 expect(()=>handlers(path)[1](request(ROLES.ADMIN,'own',[]),response(),jest.fn())).toThrow('permissions');
});
it.each(['/outstanding-letters/preview','/outstanding-letters/generate','/outstanding-letters','/outstanding-letters/print','/outstanding-letters/printed'])('requires letter permission on %s',path=>{
 expect(()=>handlers(path)[0](request(ROLES.BILLING_OFFICER,'own',[]),response(),jest.fn())).toThrow('permissions');
});
it('forces assigned branch and rejects explicit foreign branches',()=>{
 expect(outstandingScope(request(ROLES.ACCOUNTANT))).toBe('own');
 expect(()=>outstandingScope(request(ROLES.ACCOUNTANT),'foreign')).toThrow('own branch');
 expect(()=>outstandingScope(request(ROLES.ACCOUNTANT,null))).toThrow('assigned');
 expect(outstandingScope(request(ROLES.ADMIN),'foreign')).toBe('foreign');
 expect(outstandingScope(request(ROLES.ADMIN))).toBeUndefined();
});
it('scopes print and print confirmation to the assigned branch',async()=>{
 const mark=jest.spyOn(OutstandingService.prototype,'markPrinted').mockResolvedValue({marked:1});
 const req=request(ROLES.ACCOUNTANT);req.body={ids:['letter']};const next=jest.fn();
 await new OutstandingController().markPrinted(req,response(),next);
 expect(mark).toHaveBeenCalledWith(['letter'],'actor','own');
});
it('blocks foreign generation before financial reads',async()=>{
 const preview=jest.spyOn(OutstandingService.prototype,'previewLetters');
 const req=request(ROLES.ACCOUNTANT);req.body={branchId:'550e8400-e29b-41d4-a716-446655440000',asOn:'2026-01-01',threshold:0};const next=jest.fn();
 await new OutstandingController().previewLetters(req,response(),next);
 expect(preview).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
});
