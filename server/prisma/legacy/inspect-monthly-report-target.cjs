// Read-only inspection; prints no credentials or customer records.
require('dotenv').config({path:require('path').resolve(__dirname,'../../.env')});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
async function main(){
 const u=new URL(process.env.DATABASE_URL);
 const migrations=await db.$queryRawUnsafe('SELECT migration_name,finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8');
 const branches=await db.branch.findMany({select:{id:true,name:true,_count:{select:{jobCards:true,customers:true}}}});
 console.log(JSON.stringify({target:{host:u.hostname,database:u.pathname.slice(1)},migrations,branches},null,2));
}
main().catch(e=>{console.error('Target inspection failed: '+e.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[connection redacted]'));process.exitCode=1;}).finally(()=>db.$disconnect());
