import {Prisma} from '@prisma/client';
import {randomUUID} from 'crypto';
import {createPartyNoteBody,noteRegisterQuery} from './party-note.validation';
import {validateReceiptNoteLines,assertNoteCancellable} from './party-note';
import {assertNotePermission,noteScope} from './party-note.controller';
import type {Request} from 'express';
const customerId=randomUUID(),branchId=randomUUID(),receiptId=randomUUID(),ledgerId=randomUUID();
const base={customerId,branchId,date:'2026-10-01',narration:'Correction',amount:0.3,idempotencyKey:randomUUID()};
describe('Party note financial rules',()=>{
 it('accepts exact fractional credit totals',()=>expect(createPartyNoteBody.parse({...base,direction:'CREDIT',type:'AMOUNT',accountLines:[{ledgerId,amount:0.1,narration:''},{ledgerId,amount:0.2,narration:''}]}).amount).toBe(0.3));
 it.each([0.29,0.31])('rejects unbalanced credit account total %s',amount=>expect(createPartyNoteBody.safeParse({...base,direction:'CREDIT',type:'AMOUNT',accountLines:[{ledgerId,amount}]}).success).toBe(false));
 it('requires receipt lines to sum to the debit amount',()=>expect(createPartyNoteBody.safeParse({...base,direction:'DEBIT',type:'RECEIPT',receiptLines:[{receiptId,amount:0.2}]}).success).toBe(false));
 it('rejects duplicate receipt lines',()=>expect(createPartyNoteBody.safeParse({...base,direction:'DEBIT',type:'RECEIPT',receiptLines:[{receiptId,amount:0.1},{receiptId,amount:0.2}]}).success).toBe(false));
 it('rejects receipt lines on an amount note and opening creation through this endpoint',()=>{
  expect(createPartyNoteBody.safeParse({...base,direction:'DEBIT',type:'AMOUNT',receiptLines:[{receiptId,amount:0.3}]}).success).toBe(false);
  expect(createPartyNoteBody.safeParse({...base,direction:'DEBIT',type:'OPENING'}).success).toBe(false);
 });
 it.each([0,-1,0.001,Infinity])('rejects invalid money %s',amount=>expect(createPartyNoteBody.safeParse({...base,amount,direction:'DEBIT',type:'AMOUNT'}).success).toBe(false));
 const receipt={id:receiptId,customerId,branchId,status:'ACTIVE',amount:0.3,issuedAt:new Date('2026-09-30T12:00:00Z')};
 it('allows a debit up to the full receipt amount even when the receipt paid bills',()=>expect(()=>validateReceiptNoteLines([{receiptId,amount:0.3}],[receipt],customerId,branchId,new Date('2026-09-30T23:00:00Z'))).not.toThrow());
 it.each([{amount:0.29},{status:'CANCELLED'},{customerId:randomUUID()},{branchId:randomUUID()},{issuedAt:new Date('2026-10-02')}])('rejects unavailable or over-limit receipts %p',change=>expect(()=>validateReceiptNoteLines([{receiptId,amount:0.3}],[{...receipt,...change}],customerId,branchId,new Date('2026-09-30T23:00:00Z'))).toThrow());
 const note={type:'AMOUNT',status:'ACTIVE',amount:new Prisma.Decimal(100),remainingAmount:new Prisma.Decimal(100),tallyPostedAt:null};
 it('allows cancellation of a wholly unadjusted note',()=>expect(()=>assertNoteCancellable(note,false)).not.toThrow());
 it.each([{type:'OPENING'},{status:'CANCELLED'},{remainingAmount:new Prisma.Decimal(99)},{tallyPostedAt:new Date()}])('blocks note cancellation %p',change=>expect(()=>assertNoteCancellable({...note,...change},false)).toThrow());
 it('blocks active adjustments even when a cache claims the full balance',()=>expect(()=>assertNoteCancellable(note,true)).toThrow());
 it('rejects reversed date ranges and caps pages',()=>{
  expect(noteRegisterQuery.safeParse({direction:'DEBIT',from:'2026-10-02',to:'2026-10-01'}).success).toBe(false);
  expect(noteRegisterQuery.safeParse({direction:'CREDIT',from:'2026-10-01',to:'2026-10-02',pageSize:101}).success).toBe(false);
 });
});
describe('Note endpoint permissions and branches',()=>{
 const request=(role:string,permissions:string[],branch:string=branchId)=>({user:{role,permissions,branchId:branch}} as Request);
 it('uses separate debit and credit permissions',()=>{
  const req=request('Accountant',['debitnote:create']);expect(()=>assertNotePermission(req,'DEBIT','create')).not.toThrow();expect(()=>assertNotePermission(req,'CREDIT','create')).toThrow();
 });
 it('register access does not imply document cancellation',()=>{
  const req=request('Accountant',['report:credit-note-register']);expect(()=>assertNotePermission(req,'CREDIT','register')).not.toThrow();expect(()=>assertNotePermission(req,'CREDIT','cancel')).toThrow();
 });
 it('forces assigned-branch access and denies missing branches',()=>{
  expect(noteScope(request('Accountant',[]))).toBe(branchId);
  expect(()=>noteScope(request('Accountant',[]),randomUUID())).toThrow();
  expect(()=>noteScope(request('Accountant',[],'') )).toThrow();
 });
 it('lets Admin select all branches',()=>expect(noteScope(request('Admin',[]))).toBeUndefined());
});
