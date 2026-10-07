import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { seedVehicleCatalog } from '../../src/modules/vehicle-catalog/catalog-seed';

export async function seedKiaCatalog(prisma: PrismaClient) {
  const data = JSON.parse(await readFile(path.resolve(__dirname, '../../data/kia.json'), 'utf8'));
  return seedVehicleCatalog(prisma, data);
}

// Importing this seed into the full seed must not open another client or run twice.
if (require.main === module) {
  const prisma = new PrismaClient();
  seedKiaCatalog(prisma)
    .then(summary => console.log(JSON.stringify(summary, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
