// Dry-run-first, fill-only report snapshot import. Never alters invoice amounts.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {build,sameValue}=require('./seed-monthly-cohort.cjs');
const {legacyTaxSnapshot}=require('./legacy-tax-register.cjs');
const key=(r,fields)=>JSON.stringify(fields.map(f=>String(r[Object.keys(r).find(k=>k.toLowerCase()===f.toLowerCase())]??'').trim()));
async function main(){
 const [file,branchId,...args]=process.argv.slice(2);if(!file||!branchId)throw Error('Usage: node enrich-tax-register.cjs <cohort.json> <branch-id> [--apply]');
 require('dotenv').config({path:path.resolve(__dirname,'../../.env')});if(process.env.NODE_ENV==='production')throw Error('Development seed only');
 const raw=fs.readFileSync(file);const source=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));const {plan}=build(source,branchId);
 const fields=['trantype','cashinv','bill','billtype'];const snapshots=[];
 for(const bill of source.tables.jobbill){
  const sourceKey=key(bill,fields);const item=plan.find(i=>i.model==='invoice'&&i.data.invoiceNumber==='KP79:'+sourceKey);if(!item)continue;
  const job=source.tables.Job.find(j=>key(j,['trantype','job'])===key(bill,['trantype','job']));
  const taxes=source.tables.jobfatax.filter(t=>key(t,fields)===sourceKey);
  snapshots.push({id:item.data.id,total:item.data.total,snapshot:{...legacyTaxSnapshot(bill,taxes,job),sourceSha256:crypto.createHash('sha256').update(raw).digest('hex')}});
 }
 const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
 try{
  const branch=await db.branch.findUniqueOrThrow({where:{id:branchId},select:{name:true}});
  await db.$transaction(async tx=>{
   const invoices=await tx.invoice.findMany({where:{id:{in:snapshots.map(s=>s.id)},reportBranchId:branchId},select:{id:true,total:true,taxRegisterSnapshot:true}});
   if(invoices.length!==snapshots.length)throw Error('Import the base cohort into this branch first');
   const pending=snapshots.filter(s=>{const invoice=invoices.find(i=>i.id===s.id);if(!sameValue(invoice.total,s.total))throw Error('Stored invoice total differs from source');if(invoice.taxRegisterSnapshot){if(JSON.stringify(invoice.taxRegisterSnapshot.values)!==JSON.stringify(s.snapshot.values)){
    // PostgreSQL JSONB sorts object keys. Compare key/value pairs, not key order.
    if(Object.entries(s.snapshot.values).some(([k,v])=>!sameValue(invoice.taxRegisterSnapshot.values?.[k],v)))throw Error('Existing report snapshot differs; refusing overwrite');
   }if(!invoice.taxRegisterSnapshot.documentNumber && s.snapshot.documentNumber){s.before=invoice.taxRegisterSnapshot;s.snapshot={...invoice.taxRegisterSnapshot,documentNumber:s.snapshot.documentNumber};return true;}return false;}return true;});
   console.log(JSON.stringify({branch:branch.name,mode:args.includes('--apply')?'APPLY':'DRY RUN',snapshotsToFill:pending.length,sourceRoundingDifferences:snapshots.filter(s=>s.snapshot.sourceRoundingDifference!==0).length,existingInvoiceAmountsChanged:false},null,2));
   if(args.includes('--apply'))for(const s of pending){const result=await tx.invoice.updateMany({where:{id:s.id,taxRegisterSnapshot:{equals:s.before??require('@prisma/client').Prisma.DbNull}},data:{taxRegisterSnapshot:s.snapshot}});if(result.count!==1)throw Error('Concurrent snapshot change; rolled back');}
  },{timeout:180000,isolationLevel:'Serializable'});
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[connection redacted]'));process.exitCode=1;});
