import { PrismaClient } from '@prisma/client';
import { seedServiceTypes } from './service-type-data';

const prisma = new PrismaClient();
prisma.$transaction(async db => {
  const make = await db.workshopMaster.upsert({ where: { kind_code: { kind: 'MAKE', code: 'KIA' } },
    update: {}, create: { kind: 'MAKE', code: 'KIA', description: 'Kia' } });
  const product = await db.workshopMaster.upsert({ where: { kind_code: { kind: 'PRODUCT', code: 'KIA-P' } },
    update: {}, create: { kind: 'PRODUCT', code: 'KIA-P', description: 'Passenger', parentId: make.id } });
  const model = await db.workshopMaster.upsert({ where: { kind_code: { kind: 'MODEL', code: 'RIO' } },
    update: {}, create: { kind: 'MODEL', code: 'RIO', description: 'Rio', parentId: product.id, warrantyDays: 1825, warrantyKm: 100000 } });
  await seedServiceTypes(db, model.id);
}, { timeout: 30000 })
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
