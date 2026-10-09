
import { Prisma } from '@prisma/client';
import { ageBucket,asOnBalance,daysOld,reportEnd,runningBalances } from './party-report';
import { ageLimitsSchema,partyReportQuery } from './party-report.validation';
describe('Party report rules',()=>{
 it.each([[0,0],[10,0],[11,1],[20,1],[21,2],[31,3],[41,4],[51,5]])('places %i days in custom bucket %i',(age,bucket)=>expect(ageBucket(age,[10,20,30,40,50])).toBe(bucket));
 it.each([[30,60,90,120,180],[5,10,15,20,25]])('accepts increasing company limits',(...limits)=>expect(ageLimitsSchema.safeParse(limits).success).toBe(true));
 it.each([[30,30,90,120,180],[0,60,90,120,180],[30,60,90,120],[30,60,90,120,4000]])('rejects invalid limits %j',(...limits)=>expect(ageLimitsSchema.safeParse(limits).success).toBe(false));
 it('counts document age by Lagos calendar days',()=>expect(daysOld(new Date('2026-01-01T22:59:59Z'),new Date('2026-01-01T23:00:01Z'))).toBe(1));
 it('uses an exclusive next-day cutoff',()=>expect(reportEnd('2026-01-31').toISOString()).toBe('2026-01-31T23:00:00.000Z'));
 it('reconstructs fractional balances before a later reversal',()=>{
  const adjustments=[{amount:'0.1',date:new Date('2026-01-02'),reversedAt:new Date('2026-01-04')},{amount:'0.05',date:new Date('2026-01-05')}];
  expect(asOnBalance('0.3',new Date('2026-01-01'),adjustments,new Date('2026-01-03')).toFixed(2)).toBe('0.20');
  expect(asOnBalance('0.3',new Date('2026-01-01'),adjustments,new Date('2026-01-04')).toFixed(2)).toBe('0.30');
  expect(asOnBalance('0.3',new Date('2026-01-01'),adjustments,new Date('2026-01-05')).toFixed(2)).toBe('0.25');
  expect(asOnBalance('0.3',new Date('2026-01-06'),adjustments,new Date('2026-01-05')).toFixed(2)).toBe('0.00');
 });
 it('runs debit, credit, neutral adjustment and cancellation without rounding drift',()=>{
  const result=runningBalances(new Prisma.Decimal('0.1'),[{debit:'0.2',credit:0},{debit:0,credit:'0.15'},{debit:0,credit:0},{debit:'0.15',credit:0}]);
  expect(result.map(n=>n.toFixed(2))).toEqual(['0.30','0.15','0.15','0.30']);
 });
 it('requires ledger dates, bounds pages and refuses vendor accounts',()=>{
  expect(partyReportQuery.safeParse({kind:'ledger'}).success).toBe(false);
  expect(partyReportQuery.safeParse({kind:'ledger',from:'2026-02-01',to:'2026-01-01'}).success).toBe(false);
  expect(partyReportQuery.safeParse({asOn:'2026-01-01',pageSize:101}).success).toBe(false);
  expect(partyReportQuery.safeParse({asOn:'2026-01-01',side:'CREDITORS'}).success).toBe(false);
  expect(partyReportQuery.parse({kind:'age',asOn:'2026-01-01',ageLimits:'5,10,15,20,25'}).ageLimits).toEqual([5,10,15,20,25]);
 });
});
