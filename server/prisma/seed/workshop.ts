import { PrismaClient } from '@prisma/client';

export default async function seedWorkshop(prisma: PrismaClient) {
  const master = (
    kind: string,
    code: string,
    description: string,
    extra: {
      parentId?: string;
      chargedTo?: string;
      freeService?: boolean;
      category?: string;
      warrantyDays?: number;
      warrantyKm?: number;
      fuel?: string;
      gearbox?: string;
      acFitted?: boolean;
    } = {},
  ) => prisma.workshopMaster.upsert({
    where: {
      kind_code: {
        kind,
        code,
      },
    },

    update: {},

    create: {
      kind,
      code,
      description,
      ...extra,
    },
  });

  await master('SERVICE_TYPE', 'PS', 'Paid service');

  await master('SERVICE_TYPE', 'F1', 'First free service', {
    chargedTo: 'COMPANY',
    freeService: true,
  });

  await master('SERVICE_TYPE', 'RR', 'Running repair');

  await prisma.workshopMaster.updateMany({
    where: { kind: 'BAY', code: { in: ['S01', 'E01'] } },
    data: { active: false },
  });

  for (const group of ['A', 'B', 'C', 'D', 'E']) {
    for (let number = 1; number <= 5; number++) {
      const code = `${group}${number}`;
      await master('BAY', code, `Bay ${code}`, { category: group });
    }
  }

  await master('COMPLAINT', 'SG', 'Service and general check-up');
  await master('COMPLAINT', 'BN', 'Brake noise');
  await master('TEAM', 'A', 'Workshop team A');
  await master('LATE_REASON', 'PARTS', 'Awaiting parts');
  await master('LATE_REASON', 'APPROVAL', 'Awaiting customer approval');
  const make = await master('MAKE', 'KIA', 'Kia');

  const product = await master('PRODUCT', 'KIA-P', 'Passenger', {
    parentId: make.id,
  });

  const model = await master('MODEL', 'RIO', 'Rio', {
    parentId: product.id,
    warrantyDays: 1825,
    warrantyKm: 100000,
  });

  await master('VARIANT', 'RIO-AT', 'Rio automatic petrol', {
    parentId: model.id,
    fuel: 'Petrol',
    gearbox: 'Automatic',
    acFitted: true,
  });

  await master('COLOUR', 'RIO-W', 'White', {
    parentId: model.id,
  });

  const labour = await prisma.labourItem.upsert({
    where: {
      code: 'SG',
    },

    update: {},

    create: {
      code: 'SG',
      description: 'Service and general check-up',
      vehicleSystem: 'General',
      group: 'Maintenance',
      defaultHours: 1,
      rate: 15000,
    },
  });

  await prisma.labourRate.upsert({
    where: {
      labourItemId_modelId: {
        labourItemId: labour.id,
        modelId: model.id,
      },
    },

    update: {},

    create: {
      labourItemId: labour.id,
      modelId: model.id,
      pricing: 'TIME',
      hours: 1,
      rate: 15000,
    },
  });
}
