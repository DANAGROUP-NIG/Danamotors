jest.mock('../../prisma/client',()=>({__esModule:true,default:{
 $transaction:jest.fn(),$queryRaw:jest.fn(),jobCard:{findUnique:jest.fn(),update:jest.fn()},estimate:{findMany:jest.fn(),update:jest.fn(),create:jest.fn()},auditLog:{create:jest.fn()}
}}));
jest.mock('../finance/document-number',()=>({nextDocumentNumber:jest.fn(async()=> 'TEST-2')}));
import prisma from '../../prisma/client';
import {ServiceService} from './service.service';
const previous={id:'old',version:1,description:'Original',amount:0,createdAt:new Date('2026-10-19'),lines:[{type:'COMPLAINT',description:'Original complaint',quantity:1,rate:0,amount:0}]};
const input={description:'Revision',lines:[{type:'COMPLAINT' as const,description:'Updated complaint',quantity:1}]};
beforeEach(()=>{
 jest.resetAllMocks();
 (prisma.$transaction as jest.Mock).mockImplementation(cb=>cb(prisma));
 (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({id:'job',status:'OPEN',createdById:'actor'});
 (prisma.estimate.findMany as jest.Mock).mockResolvedValue([previous]);
 (prisma.estimate.create as jest.Mock).mockImplementation(({data})=>({...data,id:'new'}));
});
test('revision supersedes source and creates unsigned N+1 with before/after audit',async()=>{
 const result=await new ServiceService().addEstimate('job',input,'actor','old');
 expect(result).toMatchObject({version:2,supersedesId:'old',amount:0,status:'Pending'});
 expect(result).not.toHaveProperty('approvals');expect(result).not.toHaveProperty('signatures');
 expect(prisma.estimate.update).toHaveBeenCalledWith({where:{id:'old'},data:{status:'SUPERSEDED'}});
 const audit=(prisma.auditLog.create as jest.Mock).mock.calls[0][0].data;
 expect(audit.userId).toBe('actor');expect(audit.action).toBe('ESTIMATE_REVISED');
 expect(JSON.parse(audit.details)).toMatchObject({before:{description:'Original'},after:{description:'Revision'},version:2,supersedesId:'old'});
 expect((prisma.$queryRaw as jest.Mock).mock.calls[0][0].sql).toContain('FOR UPDATE');
});
test('create cannot create another estimate and stale revision cannot replace latest',async()=>{
 await expect(new ServiceService().addEstimate('job',input,'actor')).rejects.toThrow('Use revise');
 await expect(new ServiceService().addEstimate('job',input,'actor','stale')).rejects.toThrow('latest');
 expect(prisma.estimate.create).not.toHaveBeenCalled();
});
