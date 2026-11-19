/**
 * PDI reference data: PDI defects, tyre and battery makes, the internal PDI customer and the
 * PDI settings row. PDI service types (PD, BD) come from service-type-data.ts.
 * Safe to run again: existing rows and administrator edits are kept.
 *
 *   npm run prisma:seed:pdi
 */
import { PrismaClient } from '@prisma/client';

export const PDI_DEFECTS = [
  ['PDI-PAINT', 'Paint scratch or chip on body panel'],
  ['PDI-DENT', 'Dent on body panel'],
  ['PDI-BULB', 'Lamp or bulb not working'],
  ['PDI-WIPER', 'Wiper blade damaged or missing'],
  ['PDI-BATT', 'Battery voltage low'],
  ['PDI-TYRE', 'Tyre pressure low or tyre damaged'],
  ['PDI-FLUID', 'Fluid level low (oil, coolant, washer)'],
  ['PDI-ACC', 'Accessory missing (mat, jack, tool kit)'],
  ['PDI-ELEC', 'Electrical fault (window, mirror, audio)'],
  ['PDI-TRIM', 'Interior trim loose or damaged'],
] as const;

export const TYRE_MAKES = [
  ['MICHELIN', 'MICHELIN'], ['BRIDGESTONE', 'BRIDGESTONE'], ['HANKOOK', 'HANKOOK'], ['KUMHO', 'KUMHO'], ['NEXEN', 'NEXEN'],
] as const;

export const BATTERY_MAKES = [['VARTA', 'VARTA'], ['AMARON', 'AMARON'], ['EXIDE', 'EXIDE']] as const;

/** Internal customer PDIs are opened for (the dealership's PDI and transit account). */
export const PDI_CUSTOMER_CODE = 'PDI-INTERNAL';

export async function seedPdiReference(db: PrismaClient) {
  const group = await db.workshopMaster.findFirst({ where: { kind: 'VEHICLE_GROUP', active: true }, orderBy: { code: 'asc' }, select: { id: true } });
  for (const [code, description] of PDI_DEFECTS)
    await db.workshopMaster.upsert({ where: { kind_code: { kind: 'PDI_DEFECT', code } }, update: {}, create: { kind: 'PDI_DEFECT', code, description, parentId: group?.id } });
  for (const [code, description] of TYRE_MAKES)
    await db.workshopMaster.upsert({ where: { kind_code: { kind: 'TYRE_MAKE', code } }, update: {}, create: { kind: 'TYRE_MAKE', code, description } });
  for (const [code, description] of BATTERY_MAKES)
    await db.workshopMaster.upsert({ where: { kind_code: { kind: 'BATTERY_MAKE', code } }, update: {}, create: { kind: 'BATTERY_MAKE', code, description } });

  // The PDI customer belongs to the first (head office) branch; PDIs at any branch can use it.
  const branch = await db.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!branch) throw new Error('Seed the branches before the PDI reference data');
  const customer = await db.customer.upsert({
    where: { code: PDI_CUSTOMER_CODE },
    update: {},
    create: { code: PDI_CUSTOMER_CODE, type: 'CORPORATE', firstName: 'PDI', lastName: 'Internal', companyName: 'DANA MOTORS PDI (INTERNAL)', country: 'Nigeria', branchId: branch.id },
  });
  await db.pdiSettings.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default', defaultCustomerId: customer.id } });
  await db.pdiSettings.updateMany({ where: { id: 'default', defaultCustomerId: null }, data: { defaultCustomerId: customer.id } });
  return { customerId: customer.id };
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedPdiReference(prisma)
    .then(result => console.log(`PDI reference data ready (PDI customer ${result.customerId})`))
    .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
