import { z } from 'zod';
import { Prisma } from '@prisma/client';
const amount=z.number().finite().positive().max(1e12).refine(v=>new Prisma.Decimal(v).decimalPlaces()<=2,'Use at most two decimal places');
const common={customerId:z.string().uuid(),branchId:z.string().uuid(),date:z.string().date(),amount,narration:z.string().trim().min(1).max(2000),idempotencyKey:z.string().uuid()};
export const createPartyNoteBody=z.discriminatedUnion('direction',[
 z.object({...common,direction:z.literal('DEBIT'),type:z.enum(['RECEIPT','AMOUNT']),receiptLines:z.array(z.object({receiptId:z.string().uuid(),amount}).strict()).max(200).default([])}).strict(),
 z.object({...common,direction:z.literal('CREDIT'),type:z.literal('AMOUNT'),accountLines:z.array(z.object({ledgerId:z.string().uuid(),narration:z.string().trim().max(1000).default(''),amount}).strict()).min(1).max(200)}).strict(),
]).superRefine((body,ctx)=>{
 const lines=body.direction==='CREDIT'?body.accountLines:body.receiptLines;
 if(body.direction==='DEBIT'&&body.type==='AMOUNT'&&lines.length)ctx.addIssue({code:'custom',path:['receiptLines'],message:'Amount notes do not have receipt lines'});
 if(body.direction==='CREDIT'||body.type==='RECEIPT'){
  if(!lines.length||!lines.reduce((sum,l)=>sum.plus(l.amount),new Prisma.Decimal(0)).equals(body.amount))ctx.addIssue({code:'custom',path:[body.direction==='CREDIT'?'accountLines':'receiptLines'],message:'Line totals must equal the note amount'});
 }
 if(body.direction==='DEBIT'&&new Set(body.receiptLines.map(l=>l.receiptId)).size!==body.receiptLines.length)ctx.addIssue({code:'custom',path:['receiptLines'],message:'Each receipt can appear only once'});
});
export const createPartyNoteSchema=z.object({body:createPartyNoteBody});
export const noteIdSchema=z.object({params:z.object({id:z.string().uuid()}),query:z.object({}).strict()});
export const cancelPartyNoteSchema=z.object({params:z.object({id:z.string().uuid()}),body:z.object({remark:z.string().trim().min(1).max(1000)}).strict()});
export const noteRegisterQuery=z.object({direction:z.enum(['DEBIT','CREDIT']),branchId:z.string().uuid().optional(),customerId:z.string().uuid().optional(),from:z.string().date(),to:z.string().date(),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25)}).strict().refine(v=>v.from<=v.to,{path:['to'],message:'End date must be on or after start date'});
export const noteRegisterSchema=z.object({query:noteRegisterQuery});
export const noteReceiptQuerySchema=z.object({query:z.object({customerId:z.string().uuid(),branchId:z.string().uuid(),search:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict()});
export const notePartyQuerySchema=z.object({query:z.object({branchId:z.string().uuid(),search:z.string().trim().max(100).default(''),order:z.enum(['name','code']).default('name'),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict()});
export const noteLedgerQuerySchema=z.object({query:z.object({search:z.string().trim().max(100).default(''),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict()});
export type CreatePartyNoteInput=z.infer<typeof createPartyNoteBody>;
export type NoteRegisterInput=z.infer<typeof noteRegisterQuery>;
