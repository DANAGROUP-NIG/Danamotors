import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedVehicleCatalog } from '../../src/modules/vehicle-catalog/catalog-seed';
const prisma = new PrismaClient();
async function main() {
  const data = JSON.parse(await readFile(path.resolve(__dirname, '../../data/kia.json'), 'utf8'));
  const summary = await seedVehicleCatalog(prisma, data);
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
