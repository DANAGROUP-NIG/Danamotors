import { projectEstimatePrint } from './estimate-print';
test('print projection excludes internal fields and unrelated estimates',()=>{
 const source={id:'e',version:2,estimateNumber:'2026000001',estimateDate:null,createdAt:new Date(),description:'internal description',status:'SUPERSEDED',currency:'NGN',amount:100,successor:{version:3},approvals:[],lines:[{type:'PART',referenceId:'p',description:'Part',quantity:1,rate:100,amount:100,source:'IPO',cost:50,chargeType:'WARRANTY'},{type:'COMPLAINT',description:'Customer complaint',quantity:1,rate:0,amount:0}],remarks:'Secret',qc:'FAILED',assignments:['staff'],estimates:['other']};
 const result=projectEstimatePrint(source,new Map([['p','PART-001']]));
 expect(result.supersededBy).toBe(3);expect(result.lines).toHaveLength(1);expect(result.lines[0].code).toBe('PART-001');
 const json=JSON.stringify(result);for(const field of ['source','cost','chargeType','remarks','qc','assignments','estimates'])expect(json).not.toContain('"'+field+'":');
 expect(json).not.toContain('Secret');expect(result.signature).toBeNull();
});
