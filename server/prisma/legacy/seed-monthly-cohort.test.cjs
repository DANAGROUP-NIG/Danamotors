// Offline checks: no DB credentials or network connection needed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Prisma}=require('@prisma/client');
const {build}=require('./seed-monthly-cohort.cjs');
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const result=build(source,'offline-test-branch');
const models=Object.fromEntries(Prisma.dmmf.datamodel.models.map(m=>[m.name[0].toLowerCase()+m.name.slice(1),m]));
const ids=new Set();
for(const {model,data}of result.plan){
 assert(!ids.has(data.id));ids.add(data.id);
 const schema=models[model];assert(schema);
 for(const k of Object.keys(data))assert(schema.fields.some(f=>f.name===k),model+'.'+k);
 for(const f of schema.fields.filter(f=>f.isRequired&&!f.hasDefaultValue&&!f.isUpdatedAt&&f.kind!=='object'&&!f.isList))assert(data[f.name]!=null,model+'.'+f.name);
}
assert(result.plan.filter(r=>r.model==='invoice').every(r=>r.data.billType===null));
assert(result.plan.filter(r=>r.model==='sparePart').every(r=>r.data.taxCategory===undefined));
assert.deepEqual(build(source,'offline-test-branch').plan,result.plan);
const bad=structuredClone(source);bad.tables.requisitionpartdetail[0].qtyreturned=99999;
assert.throws(()=>build(bad,'offline-test-branch'),/Returned quantity/);
const counts={};for(const r of result.plan)counts[r.model]=(counts[r.model]||0)+1;
console.log(JSON.stringify({passed:true,counts,skipped:result.skipped},null,2));
