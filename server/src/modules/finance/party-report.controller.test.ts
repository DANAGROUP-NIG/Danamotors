
jest.mock('../../prisma/client',()=>({__esModule:true,default:{}}));
import type { Request,Response,RequestHandler } from 'express';
import { PartyReportController,requirePartyReport,PARTY_REPORT_PERMISSIONS } from './party-report.controller';
import { PartyReportService } from './party-report.service';
import router from './finance.routes';
const request=(role='Accountant',branchId:string|null='own')=>({method:'GET',user:{userId:'actor',role,branchId,permissions:Object.values(PARTY_REPORT_PERMISSIONS)},query:{kind:'outstanding',asOn:'2026-01-01'}} as unknown as Request);
const response=()=>{const res={json:jest.fn(),setHeader:jest.fn(),write:jest.fn().mockReturnValue(true),end:jest.fn(),destroy:jest.fn()};return res as unknown as Response;};
afterEach(()=>jest.restoreAllMocks());
it.each(['ledger','outstanding','age','bill'] as const)('requires the specific %s permission for report data and output',kind=>{
 const req=request();req.query.kind=kind;req.user!.permissions=[];expect(()=>requirePartyReport(req,response(),jest.fn())).toThrow('report permission');
 req.user!.permissions=[PARTY_REPORT_PERMISSIONS[kind]];const next=jest.fn();requirePartyReport(req,response(),next);expect(next).toHaveBeenCalledTimes(1);
});
it('rejects missing and explicitly foreign branches before querying report data',async()=>{
 const report=jest.spyOn(PartyReportService.prototype,'report');const controller=new PartyReportController();const next=jest.fn();
 const req=request();req.query.branchId='00000000-0000-4000-8000-000000000001';await controller.report(req,response(),next);await controller.report(request('Accountant',null),response(),next);
 expect(next).toHaveBeenCalledTimes(2);expect(report).not.toHaveBeenCalled();
});
it('scopes an Accountant to their branch and permits an Admin all-branch report',async()=>{
 const report=jest.spyOn(PartyReportService.prototype,'report').mockResolvedValue({rows:[],totals:{customerId:'',name:'',code:null},ageLimits:[30,60,90,120,180],meta:{page:1,pageSize:25,total:0,totalPages:0}});
 const controller=new PartyReportController();await controller.report(request(),response(),jest.fn());await controller.report(request('Admin',null),response(),jest.fn());
 expect(report.mock.calls.map(([input])=>input.branchId)).toEqual(['own',undefined]);
});
it.each(['/party-reports','/party-reports/export','/party-reports/print'])('uses permission and Zod middleware on %s',path=>{
 const layer=(router as unknown as {stack:Array<{route?:{path:string;stack:Array<{handle:RequestHandler}>}}>}).stack.find(l=>l.route?.path===path)!.route!;
 expect(layer.stack).toHaveLength(3);const req=request();req.user!.permissions=[];expect(()=>layer.stack[0].handle(req,response(),jest.fn())).toThrow('report permission');
});
it('requires Admin for company settings even if Accountant holds report permission',()=>{
 const route=(router as unknown as {stack:Array<{route?:{path:string;methods:{put?:boolean};stack:Array<{handle:RequestHandler}>}}>}).stack.find(l=>l.route?.path==='/settings/party-reports'&&l.route.methods.put)!.route!;
 expect(()=>route.stack[0].handle(request(),response(),jest.fn())).toThrow('required role');
});
it('streams a valid Excel workbook with typed text, escaping and exact totals',async()=>{
 jest.spyOn(PartyReportService.prototype,'settings').mockResolvedValue({ageLimits:[30,60,90,120,180]});
 jest.spyOn(PartyReportService.prototype,'stream').mockImplementation(async(_input,consume)=>consume([{customerId:'p',code:'=1+1',name:'A & <B>',debits:0.1,credits:0,net:0.1},{customerId:'q',code:'C2',name:'Other',debits:0.2,credits:0,net:0.2}]));
 const res=response();const next=jest.fn();await new PartyReportController().export(request('Admin',null),res,next);const xml=(res.write as jest.Mock).mock.calls.map(c=>c[0]).join('')+(res.end as jest.Mock).mock.calls[0][0];
 expect(next).not.toHaveBeenCalled();expect(xml).toContain('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');expect(xml).toContain('ss:Type="String">=1+1');expect(xml).toContain('A &amp; &lt;B&gt;');expect(xml).toContain('ss:Type="Number">0.3');expect(xml).not.toContain('ss:Formula');
});
it('prints a new party section and opening/closing for every ledger party',async()=>{
 jest.spyOn(PartyReportService.prototype,'settings').mockResolvedValue({ageLimits:[30,60,90,120,180]});
 jest.spyOn(PartyReportService.prototype,'stream').mockImplementation(async(_input,consume)=>consume([{customerId:'p',code:'C1',name:'A <B>',debit:10,credit:0,opening:5,closing:15},{customerId:'q',code:'C2',name:'Other',debit:20,credit:0,opening:0,closing:20}]));
 const req=request('Admin',null);req.query={kind:'ledger',from:'2026-01-01',to:'2026-01-03'};const res=response();await new PartyReportController().print(req,res,jest.fn());const html=(res.write as jest.Mock).mock.calls.map(c=>c[0]).join('');
 expect(html.match(/<section class="party">/g)).toHaveLength(2);expect(html).toContain('break-before:page');expect(html).toContain('Opening balance: 5');expect(html).toContain('Closing balance: 15');expect(html).toContain('A &lt;B&gt;');
});

it('requires outstanding permission when kind is omitted from a report request',()=>{const req=request();delete req.query.kind;req.user!.permissions=[PARTY_REPORT_PERMISSIONS.ledger];expect(()=>requirePartyReport(req,response(),jest.fn())).toThrow('report permission');});
