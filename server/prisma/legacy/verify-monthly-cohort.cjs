// Read-only post-import checks; emits aggregate evidence only.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {build,sameValue}=require('./seed-monthly-cohort.cjs');
async function main(){
 const [file,branchId,output]=process.argv.slice(2);
 if(!file||!branchId)throw Error('Usage: node verify-monthly-cohort.cjs <cohort.json> <branch-id> [summary.json]');
 require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
 const source=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 const {plan,skipped,audit}=build(source,branchId);
 const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
 try{
  const grouped=new Map();for(const item of plan){if(!grouped.has(item.model))grouped.set(item.model,[]);grouped.get(item.model).push(item);}
  const counts={};
  for(const [model,items]of grouped){
   const rows=await db[model].findMany({where:{id:{in:items.map(i=>i.data.id)}}});
   assert.equal(rows.length,items.length,'Imported count mismatch: '+model);
   const byId=new Map(rows.map(r=>[r.id,r]));
   for(const item of items)for(const [field,expected]of Object.entries(item.data)){
    const actual=byId.get(item.data.id)[field];
    assert(sameValue(actual,expected),'Imported value mismatch: '+model+'.'+field);
   }
   counts[model]=rows.length;
  }
  const invoices=await db.invoice.aggregate({where:{id:{in:plan.filter(r=>r.model==='invoice').map(r=>r.data.id)},cancelledAt:null},_sum:{total:true},_count:true});
  assert.equal(Math.round(invoices._sum.total*100),Math.round(audit.sourceTotals.activeBillAmount*100),'Active bill total mismatch');
  const branch=await db.branch.findUniqueOrThrow({where:{id:branchId},select:{name:true}});
  const report={verifiedAt:new Date().toISOString(),branch:branch.name,period:source.selection,counts,skipped,activeBills:invoices._count,activeBillTotal:invoices._sum.total,storedValuesMatch:true,limitations:audit.limitations.filter(s=>!s.startsWith('Target conflicts'))};
  const json=JSON.stringify(report,null,2)+'\n';if(output)fs.writeFileSync(output,json);console.log(json);
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[connection redacted]'));process.exitCode=1;});
