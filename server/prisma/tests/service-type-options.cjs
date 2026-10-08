// Execute the real parameterized lookup against isolated PostgreSQL, never DATABASE_URL.
// Match Prisma's UTC interpretation of PostgreSQL timestamp-without-time-zone values.
process.env.TZ = 'UTC';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
require('ts-node/register/transpile-only');
const { ServiceTypeService } = require('../../src/modules/workshop/service-type.service');
const { LEGACY_SERVICE_TYPES, rioServiceTypeCharge } = require('../../src/modules/workshop/service-type.defaults');
const { eligibleServiceTypesQuery } = require('../../src/modules/workshop/service-type.repository');
const db = new PGlite();
let queryCount = 0;
const adapter = { $queryRaw: async query => {
  queryCount++;
  // Match Prisma's timestamp deserialization for this isolated database adapter.
  return (await db.query(query.text, query.values)).rows.map(row => ({
    ...row, effectiveFrom: row.effectiveFrom ? new Date(row.effectiveFrom) : null,
  }));
} };

async function insert(table, data) {
  const values = { id: randomUUID(), ...(table === 'Vehicle' ? { customModel: 'Rio fixture' } : {}), ...data };
  const fields = Object.keys(values);
  const quoted = fields.map(field => `"${field}"`).join(',');
  const params = fields.map((_, index) => `$${index + 1}`).join(',');
  await db.query(`INSERT INTO "${table}" (${quoted}) VALUES (${params})`, Object.values(values).map(value => value instanceof Date ? value.toISOString() : value));
  return values;
}

(async () => {
  const root = path.resolve(__dirname, '../migrations');
  for (const name of fs.readdirSync(root).sort()) {
    const file = path.join(root, name, 'migration.sql');
    if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
  }
  const now = new Date();
  const make = await insert('WorkshopMaster', { kind: 'MAKE', code: 'KIA', description: 'Kia', updatedAt: now });
  const product = await insert('WorkshopMaster', { kind: 'PRODUCT', code: 'KIA-P', description: 'Passenger', parentId: make.id, updatedAt: now });
  const model = await insert('WorkshopMaster', { kind: 'MODEL', code: 'RIO', description: 'Rio', parentId: product.id, updatedAt: now });
  const variant = await insert('WorkshopMaster', { kind: 'VARIANT', code: 'RIO-AT', description: 'Rio automatic', parentId: model.id, updatedAt: now });
  const descendant = await insert('WorkshopMaster', { kind: 'VARIANT', code: 'RIO-EXTRA', description: 'Nested variant', parentId: variant.id, updatedAt: now });
  const sold = await insert('Vehicle', { vin: 'sold-rio', catalogueId: variant.id, saleDate: now, updatedAt: now });
  const unsold = await insert('Vehicle', { vin: 'unsold-rio', catalogueId: descendant.id, updatedAt: now });
  const direct = await insert('Vehicle', { vin: 'direct-model', catalogueId: model.id, saleDate: now, updatedAt: now });
  const noModel = await insert('Vehicle', { vin: 'no-model', updatedAt: now });
  const catalogMake = await insert('VehicleCatalogMake', { name: 'Kia' });
  const catalogModel = await insert('VehicleCatalogModel', { makeId: catalogMake.id, name: 'Rio / Rio Sedan', searchName: 'rio rio sedan', aliases: ['rio', 'rio sedan'], yearStart: 2000 });
  const catalogVehicle = await insert('Vehicle', { vin: 'catalog-rio', modelId: catalogModel.id, customModel: null, saleDate: now, updatedAt: now });
  const namedVehicle = await insert('Vehicle', { vin: 'named-rio', customMake: 'KIA', customModel: 'Rio', saleDate: now, updatedAt: now });
  const displayVehicle = await insert('Vehicle', { vin: 'display-rio', make: 'Kia', model: 'Rio', customModel: 'Unspecified (legacy)', saleDate: now, updatedAt: now });
  const wrongMake = await insert('Vehicle', { vin: 'other-make', customMake: 'Other', customModel: 'Rio', updatedAt: now });
  const policyModel = await insert('VehicleModel', { code: 'RIO', make: 'Kia', name: 'Rio', updatedAt: now });
  const policyVehicle = await insert('Vehicle', { vin: 'policy-rio', vehicleModelId: policyModel.id, customMake: 'Kia', customModel: 'Rio', saleDate: now, updatedAt: now });
  const wrongPolicyVehicle = await insert('Vehicle', { vin: 'wrong-policy', vehicleModelId: policyModel.id, customMake: 'Ford', customModel: 'Ranger', saleDate: now, updatedAt: now });
  const types = {};
  for (const [code, description, chargedTo, freeService] of LEGACY_SERVICE_TYPES) {
    types[code] = await insert('WorkshopMaster', { kind: 'SERVICE_TYPE', code, description, chargedTo, freeService, preDelivery: ['PD', 'BD'].includes(code), updatedAt: now });
    if (code !== 'DI') await insert('ServiceTypeModelSetting', { serviceTypeId: types[code].id, modelId: model.id, ...rioServiceTypeCharge(code) });
  }
  for (const [code, active, settingActive] of [['AF', true, true], ['4S', false, true], ['XX', true, false]]) {
    const type = await insert('WorkshopMaster', { kind: 'SERVICE_TYPE', code, description: code, active, updatedAt: now });
    await insert('ServiceTypeModelSetting', { serviceTypeId: type.id, modelId: model.id, serviceCharge: 99, active: settingActive });
  }
  const service = new ServiceTypeService();
  const date = new Date('2026-10-07T00:00:00Z');
  const expectedSold = ['1F', '1P', '2F', '2P', '3F', '3P', '4P', 'AC', 'CN', 'IJ', 'KS', 'RG', 'RJ', 'RR', 'RW', 'SC'];
  let before = queryCount;
  assert.deepEqual((await service.options(sold.id, date, adapter)).items.map(item => item.code), expectedSold);
  assert.equal(queryCount - before, 1, 'Dropdown lookup must use one database round trip');
  assert.deepEqual((await service.options(unsold.id, date, adapter)).items.map(item => item.code), [...expectedSold, 'BD', 'PD'].sort());
  assert.deepEqual((await service.options(direct.id, date, adapter)).items.map(item => item.code), expectedSold);
  assert.equal((await service.options(noModel.id, date, adapter)).items.length, 0);
  for (const vehicle of [catalogVehicle, namedVehicle, displayVehicle, policyVehicle]) {
    before = queryCount;
    assert.deepEqual((await service.options(vehicle.id, date, adapter)).items.map(item => item.code), expectedSold);
    assert.equal(queryCount - before, 1, 'Alternate model identity must resolve in the same SQL query');
  }
  assert.equal((await service.options(wrongMake.id, date, adapter)).items.length, 0);
  assert.equal((await service.options(wrongPolicyVehicle.id, date, adapter)).items.length, 0, 'Warranty policy must never override the physical vehicle identity');
  await assert.rejects(service.requireAvailable(adapter, wrongPolicyVehicle.id, types.RG.id, date), error => error.statusCode === 400);
  const duplicateModel = await insert('WorkshopMaster', { kind: 'MODEL', code: 'RIO-OTHER', description: 'Rio', parentId: product.id, updatedAt: now });
  assert.equal((await service.options(catalogVehicle.id, date, adapter)).items.length, 0, 'Ambiguous make/model matches must not choose a price');
  assert.deepEqual((await service.options(sold.id, date, adapter)).items.map(item => item.code), expectedSold, 'Explicit catalogue linkage takes precedence');
  await db.query('DELETE FROM "WorkshopMaster" WHERE id=$1', [duplicateModel.id]);
  const paid = (await service.options(sold.id, date, adapter)).items.find(item => item.code === 'RG');
  assert.equal(paid.serviceCharge, 15100);
  assert.equal((await service.options(sold.id, new Date('2022-04-19T23:59:59Z'), adapter)).items.find(item => item.code === 'RG').serviceCharge, 12800);
  assert.equal((await service.options(sold.id, new Date('2022-04-20T00:00:00Z'), adapter)).items.find(item => item.code === 'RG').serviceCharge, 15100);
  assert.equal((await service.options(sold.id, date, adapter)).items.find(item => item.code === 'RR').serviceCharge, 2100);
  assert.equal((await service.options(sold.id, date, adapter)).items.find(item => item.code === '1F').chargedTo, 'COMPANY');
  before = queryCount;
  assert.equal((await service.requireAvailable(adapter, sold.id, types.RG.id, date)).serviceCharge, 15100);
  assert.equal(queryCount - before, 1, 'Opening validation must use one database round trip');
  await assert.rejects(service.requireAvailable(adapter, sold.id, types.DI.id, date), error => error.statusCode === 400 && error.message === 'Service type not available for this vehicle model');
  await assert.rejects(service.requireAvailable(adapter, sold.id, types.PD.id, date), error => error.statusCode === 400);
  await assert.rejects(service.options(randomUUID(), date, adapter), error => error.statusCode === 404);
  await db.query('UPDATE "WorkshopMaster" SET "displayOrder" = 0 WHERE id = $1', [types.SC.id]);
  assert.equal((await service.options(sold.id, date, adapter)).items[0].code, 'SC');
  await db.query('UPDATE "WorkshopMaster" SET active = false WHERE id = $1', [model.id]);
  assert.equal((await service.options(sold.id, date, adapter)).items.length, 0);
  await db.query('UPDATE "WorkshopMaster" SET active = true WHERE id = $1', [model.id]);
  await db.query('UPDATE "WorkshopMaster" SET "parentId" = id WHERE id = $1', [variant.id]);
  assert.match((await service.options(sold.id, date, adapter)).message, /Vehicle has no model|No workshop service model/);
  const lookup = eligibleServiceTypesQuery(direct.id);
  const plan = await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lookup.text}`, lookup.values);
  const explain = plan.rows[0]['QUERY PLAN'][0];
  console.log('PASS: sold/unsold RIO, model/variant ancestry, missing model, inactive settings/types, AF exclusion, dates, ordering, cycle safety and HTTP 400 service rejection');
  console.log(`Isolated lookup plan: execution ${explain['Execution Time']}ms; one SQL query (no live-network latency included)`);
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { await db.close(); });
