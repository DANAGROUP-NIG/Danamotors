import { Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
export function validateReceiptNoteLines(lines:Array<{receiptId:string;amount:number}>,receipts:Array<{id:string;amount:number;status:string;customerId:string;branchId:string|null;issuedAt:Date}>,customerId:string,branchId:string,date:Date){
 for(const line of lines){
  const receipt=receipts.find(r=>r.id===line.receiptId);
  if(!receipt||receipt.status!=='ACTIVE'||receipt.customerId!==customerId||receipt.branchId!==branchId)throw new BadRequestError('Choose active receipts for this party and branch');
  if(receipt.issuedAt>=new Date(date.getTime()+86400000))throw new BadRequestError('A linked receipt cannot be later than the debit note');
  if(new Prisma.Decimal(line.amount).gt(new Prisma.Decimal(receipt.amount).toDecimalPlaces(2)))throw new BadRequestError('Debit amount cannot exceed the linked receipt amount');
 }
}
export function assertNoteCancellable(note:{type:string;status:string;amount:Prisma.Decimal;remainingAmount:Prisma.Decimal;tallyPostedAt:Date|null},hasAdjustments:boolean){
 if(note.type==='OPENING')throw new BadRequestError('Opening balances cannot be cancelled through the note screen');
 if(note.status!=='ACTIVE')throw new BadRequestError('This note is already cancelled');
 if(note.tallyPostedAt)throw new BadRequestError('Tally-posted notes cannot be cancelled');
 if(hasAdjustments||!note.amount.equals(note.remainingAmount))throw new BadRequestError('Adjusted notes cannot be cancelled; reverse active adjustments first');
}
