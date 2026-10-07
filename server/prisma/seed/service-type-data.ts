import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { LEGACY_SERVICE_TYPES, rioServiceTypeCharge } from '../../src/modules/workshop/service-type.defaults';

export async function seedServiceTypes(db: Prisma.TransactionClient, modelId: string) {
  await db.workshopMaster.updateMany({
    where: { kind: 'SERVICE_TYPE', code: { in: ['PS', 'F1', 'AF'] } }, data: { active: false },
  });
  // Bulk inserts preserve administrator edits when the seed is run again.
  await db.workshopMaster.createMany({
    data: LEGACY_SERVICE_TYPES.map(([code, description, chargedTo, freeService]) => ({
      id: randomUUID(), kind: 'SERVICE_TYPE', code, description, chargedTo, freeService,
      preDelivery: code === 'PD' || code === 'BD',
    })), skipDuplicates: true,
  });
  await db.workshopMaster.updateMany({
    where: { kind: 'SERVICE_TYPE', code: 'RR', description: 'Running repair' },
    data: { description: 'RUNNING REPAIR', chargedTo: 'CUSTOMER' },
  });
  // PD/BD were not marked in older versions of this seed.
  await db.workshopMaster.updateMany({
    where: { kind: 'SERVICE_TYPE', code: { in: ['PD', 'BD'] } }, data: { preDelivery: true },
  });
  const serviceTypes = await db.workshopMaster.findMany({
    where: { kind: 'SERVICE_TYPE', code: { in: LEGACY_SERVICE_TYPES.map(([code]) => code).filter(code => code !== 'DI') } },
    select: { id: true, code: true },
  });
  await db.serviceTypeModelSetting.createMany({
    data: serviceTypes.map(serviceType => ({
      serviceTypeId: serviceType.id, modelId, ...rioServiceTypeCharge(serviceType.code),
    })), skipDuplicates: true,
  });
}
