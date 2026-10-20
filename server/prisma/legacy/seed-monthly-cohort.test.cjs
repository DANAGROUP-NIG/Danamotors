// Offline checks: no DB credentials or network connection needed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Prisma}=require('@prisma/client');
const {build,sameValue}=require('./seed-monthly-cohort.cjs');
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
assert(sameValue(20444.561999999998,20444.562));
assert(!sameValue(20444.56,20444.57), 'A one-kobo difference must never be ignored');
const result=build(source,'offline-test-branch');
const models=Object.fromEntries(Prisma.dmmf.datamodel.models.map(m=>[m.name[0].toLowerCase()+m.name.slice(1),m]));
const ids=new Set();
for(const {model,data}of result.plan){
 assert(!ids.has(data.id));ids.add(data.id);
 assert(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.id), 'Imported IDs must work with UUID report filters');
 const schema=models[model];assert(schema);
 for(const k of Object.keys(data))assert(schema.fields.some(f=>f.name===k),model+'.'+k);
 for(const f of schema.fields.filter(f=>f.isRequired&&!f.hasDefaultValue&&!f.isUpdatedAt&&f.kind!=='object'&&!f.isList))assert(data[f.name]!=null,model+'.'+f.name);
}
assert(result.plan.filter(r=>r.model==='invoice').every(r=>r.data.billType===null));
assert(result.plan.filter(r=>r.model==='sparePart').every(r=>r.data.taxCategory===undefined));
assert(result.plan.filter(r=>r.model==='vehicle').every(r=>r.data.modelId || r.data.customModel?.trim()), 'Vehicle model identity must satisfy the database constraint');
assert(result.plan.filter(r=>r.model==='jobCardLine').every(r=>r.data.quantity>0 && r.data.rate>=0 && r.data.amount>=0), 'Charge lines must satisfy the database amounts constraint');
assert(result.plan.filter(r=>r.model==='estimate').every(r=>r.data.jobCardId || (r.data.branchId && r.data.customerId && r.data.vehicleId)), 'Standalone estimates need full customer and vehicle identity');
assert.deepEqual(build(source,'offline-test-branch').plan,result.plan);
const bad=structuredClone(source);bad.tables.requisitionpartdetail[0].qtyreturned=99999;
assert.throws(()=>build(bad,'offline-test-branch'),/Returned quantity/);
const counts={};for(const r of result.plan)counts[r.model]=(counts[r.model]||0)+1;
console.log(JSON.stringify({passed:true,counts,skipped:result.skipped},null,2));
