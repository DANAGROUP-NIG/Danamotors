import {Prisma} from '@prisma/client';
import {creditDueDate,invoiceStatus} from './credit-terms';
import {letterFilters,letterTemplateSchema,DEFAULT_LETTER_TEMPLATE,lettersGenerateSchema} from './outstanding.validation';
import {repairDifference} from './outstanding.service';
describe('Credit terms and outstanding validation',()=>{
 it('uses Lagos calendar days and keeps the due date inclusive',()=>{
  expect(creditDueDate(new Date('2026-01-31T23:30:00Z'),30).toISOString()).toBe('2026-03-02T23:00:00.000Z');
  expect(invoiceStatus(40,100,new Date('2026-02-01T00:00:00+01:00'),new Date('2026-02-01T22:00:00Z'))).toBe('Partially Paid');
  expect(invoiceStatus(40,100,new Date('2026-02-01T00:00:00+01:00'),new Date('2026-02-01T23:00:00Z'))).toBe('Overdue');
  expect(invoiceStatus(0,100,new Date('2026-01-01'),new Date('2026-02-01'))).toBe('Paid');
  expect(()=>creditDueDate(new Date(),-1)).toThrow();
 });
 it('requires safe complete templates and rejects future generation requests',()=>{
  expect(letterTemplateSchema.parse(DEFAULT_LETTER_TEMPLATE)).toBe(DEFAULT_LETTER_TEMPLATE);
  expect(()=>letterTemplateSchema.parse(DEFAULT_LETTER_TEMPLATE+' {{unknown}}')).toThrow('Unknown placeholder');
  expect(()=>letterFilters.parse({asOn:'2999-01-01',threshold:0})).toThrow();
  expect(()=>letterFilters.parse({asOn:'2026-01-01',threshold:0.001})).toThrow('two decimal places');
  expect(()=>lettersGenerateSchema.parse({body:{asOn:'2999-01-01',threshold:0,idempotencyKey:'550e8400-e29b-41d4-a716-446655440000',previewHash:'a'.repeat(64)}})).toThrow();
 });
 it('rejects overallocations rather than hiding invalid balances',()=>{
  const row={id:'x',kind:'INVOICE' as const,customerId:'c',number:'B1',amount:new Prisma.Decimal(100),stored:new Prisma.Decimal(0),allocated:new Prisma.Decimal(101),active:true,status:'Paid',dueDate:null,code:'A',name:'Party'};
  expect(()=>repairDifference(row)).toThrow('Invalid active allocations');
  expect(()=>repairDifference({...row,active:false})).toThrow('still has active allocations');
 });
});
