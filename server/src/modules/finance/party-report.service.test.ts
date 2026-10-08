
jest.mock('../../prisma/client',()=>({__esModule:true,default:{$transaction:jest.fn(),$queryRaw:jest.fn(),financeSetting:{findUnique:jest.fn()}}}));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { PartyReportService } from './party-report.service';
import { partyReportQuery } from './party-report.validation';
const raw=jest.fn(),execute=jest.fn(),fetch=jest.fn(),upsert=jest.fn(),audit=jest.fn();
const tx={$queryRaw:raw,$executeRawUnsafe:execute,$queryRawUnsafe:fetch,financeSetting:{upsert},auditLog:{create:audit}} as unknown as Prisma.TransactionClient;
beforeEach(()=>{jest.clearAllMocks();(prisma.$transaction as jest.Mock).mockImplementation(async(callback:(t:Prisma.TransactionClient)=>Promise<unknown>)=>callback(tx));(prisma.financeSetting.findUnique as jest.Mock).mockResolvedValue({value:[30,60,90,120,180]});});
it('reads a bounded page and totals in one consistent snapshot using dated history',async()=>{
 raw.mockResolvedValueOnce([{total:2n,debits:new Prisma.Decimal('0.3'),credits:new Prisma.Decimal('0.1'),net:new Prisma.Decimal('0.2')}]).mockResolvedValueOnce([{customerId:'party',code:'C1',name:'Party',debits:new Prisma.Decimal('0.3'),credits:new Prisma.Decimal('0.1'),net:new Prisma.Decimal('0.2')}]);
 const result=await new PartyReportService().report(partyReportQuery.parse({asOn:'2026-01-03',branchId:'00000000-0000-4000-8000-000000000001',page:2,pageSize:1}));
 expect(result.rows[0].net).toBe(0.2);expect(result.meta).toEqual({page:2,pageSize:1,total:2,totalPages:2});
 expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'RepeatableRead'}));
 const sql=raw.mock.calls[1][0] as Prisma.Sql;expect(sql.text).toContain('ROUND(a.amount::numeric,2)');expect(sql.text).toContain('"reversedAt"');expect(sql.text).toContain('"ReceiptEditLog"');expect(sql.text).toContain('"cancelledAt"');expect(sql.text).toContain('JOIN documents');expect(sql.text).toContain('LIMIT');expect(sql.values).toContain('00000000-0000-4000-8000-000000000001');expect(sql.values.some(v=>v instanceof Date&&v.toISOString()==='2026-01-03T23:00:00.000Z')).toBe(true);
});
it.each(['age','bill'])('hides credit parties by default for %s and accepts an explicit inclusion',async kind=>{
 raw.mockResolvedValue([{total:0}]);const service=new PartyReportService();const input=partyReportQuery.parse({kind,asOn:'2026-01-03',ageLimits:'5,10,15,20,25'});
 await service.report(input);expect((raw.mock.calls[0][0] as Prisma.Sql).text).toContain('t.net>=0');
 raw.mockClear();await service.report({...input,showCredit:'true'});expect((raw.mock.calls[0][0] as Prisma.Sql).text).not.toContain('t.net>=0');
});
it('does not silently accept a foreign or unavailable range endpoint',async()=>{
 raw.mockResolvedValue([]);await expect(new PartyReportService().report(partyReportQuery.parse({asOn:'2026-01-03',fromCustomerId:'00000000-0000-4000-8000-000000000001'}))).rejects.toThrow('range endpoint');
});
it('keeps parameter binding and fixed 500-row chunks in a single export snapshot',async()=>{
 fetch.mockResolvedValueOnce([{customerId:'party',code:'C1',name:'Party',debits:new Prisma.Decimal('0.3')}]).mockResolvedValueOnce([]);const consume=jest.fn();
 await new PartyReportService().stream(partyReportQuery.parse({asOn:'2026-01-03'}),consume);
 expect(execute.mock.calls[0][0]).toContain('DECLARE party_report_cursor');expect(execute.mock.calls[0][0]).toContain('$1');expect(execute.mock.calls[0][0]).not.toContain('2026-01-03');
 expect(fetch).toHaveBeenCalledWith('FETCH FORWARD 500 FROM party_report_cursor');expect(consume).toHaveBeenCalledTimes(1);expect(consume.mock.calls[0][0][0].debits).toBe(0.3);expect(execute).toHaveBeenLastCalledWith('CLOSE party_report_cursor');
});
it('audits settings changes in the shared serializable transaction',async()=>{
 await new PartyReportService().saveSettings([5,10,15,20,25],'actor');
 expect(upsert).toHaveBeenCalledWith(expect.objectContaining({update:{value:[5,10,15,20,25]}}));expect(audit).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'PARTY_REPORT_SETTINGS_UPDATED',userId:'actor'})}));expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),expect.objectContaining({isolationLevel:'Serializable'}));
});
