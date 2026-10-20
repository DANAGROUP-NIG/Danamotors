import { PrismaClient } from '@prisma/client';
import { createMonthlyReportFixture } from '../../src/modules/reports/monthly-reports.fixture';
const db=new PrismaClient();
async function main(){
 if(process.env.NODE_ENV==='production')throw new Error('QA fixture is unavailable in production');
 if(process.env.MONTHLY_REPORT_QA_CONFIRMED!=='true')throw new Error('Set MONTHLY_REPORT_QA_CONFIRMED=true only for a disposable local QA database');
 const existing=await db.branch.findUnique({where:{name:'QA79 QA'}});if(existing){console.log('QA79 already exists. Select branch QA79 QA. No records changed.');return;}
 const f=await createMonthlyReportFixture(db,'QA79');console.log(JSON.stringify({branch:f.branch.name,branchId:f.branch.id,vehicleId:f.vehicle.id,expected:f.expected,logins:f.users.map((u,index)=>({email:u.email,role:index===6?'No report permissions':u.lastName})),password:'Issue79-QA-Only-2026!',from:'2026-10-01',to:'2026-10-07'},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
