jest.mock('../../prisma/client',()=>({__esModule:true,default:{invoice:{findMany:jest.fn()},receipt:{findMany:jest.fn()},partyNote:{findMany:jest.fn()},tallyPostingLog:{findMany:jest.fn()}}}));
import prisma from '../../prisma/client';
import {TallyService} from './tally.service';
describe('Pending note Tally batches',()=>{
 const debit={id:'debit',number:'2026000001',direction:'DEBIT'},credit={id:'credit',number:'2026000002',direction:'CREDIT'};
 beforeEach(()=>{
  jest.clearAllMocks();
  (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.receipt.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.partyNote.findMany as jest.Mock).mockImplementation(({where}:{where:{direction:{in:string[]}}})=>Promise.resolve([debit,credit].filter(n=>where.direction.in.includes(n.direction))));
  (prisma.tallyPostingLog.findMany as jest.Mock).mockImplementation(({where}:{where:{OR:Array<{documentType:string;documentId:{in:string[]}}>}})=>Promise.resolve(where.OR.flatMap(condition=>condition.documentId.in.map(id=>({documentType:condition.documentType,documentId:id,batchId:'batch',payload:'<TALLYMESSAGE>'+id+'</TALLYMESSAGE>'})))));
 });
 it('returns only credit-note XML when debit-note read permission is absent',async()=>{
  const batches=await new TallyService().pendingBatches('branch',['CREDIT']);
  expect(batches[0].exported.map(n=>n.id)).toEqual(['credit']);expect(batches[0].xml).not.toContain('debit');
  expect(prisma.partyNote.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({branchId:'branch',direction:{in:['CREDIT']}})}));
 });
 it('returns no note payload when both note read permissions are absent',async()=>{
  expect(await new TallyService().pendingBatches('branch',[])).toEqual([]);
 });
 it('keeps separate debit/credit document types and generated numbers in a mixed batch',async()=>{
  const batches=await new TallyService().pendingBatches('branch');
  expect(batches[0].exported).toEqual([{type:'DEBIT_NOTE',id:'debit',documentNumber:debit.number},{type:'CREDIT_NOTE',id:'credit',documentNumber:credit.number}]);
 });
});
