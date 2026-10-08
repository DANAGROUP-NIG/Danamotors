// Real SQL, isolated PostgreSQL; never connects to DATABASE_URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
require('ts-node/register/transpile-only');
const { WorkshopVehicleCatalog } = require('../../src/modules/vehicle-catalog/workshop-vehicle-catalog');
const db = new PGlite();
let calls = 0;
const adapter = { $queryRaw: async sql => { calls++; return (await db.query(sql.text, sql.values)).rows; } };
async function master(kind, code, description, parentId = null, active = true) {
  const id = randomUUID();
  await db.query('INSERT INTO "WorkshopMaster" (id,kind,code,description,"parentId",active,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',
    [id, kind, code, description, parentId, active]);
  return id;
}
(async () => {
  for (const name of fs.readdirSync(path.resolve(__dirname, '../migrations')).sort()) {
    const file = path.resolve(__dirname, '../migrations', name, 'migration.sql');
    if (fs.existsSync(file)) await db.exec(fs.readFileSync(file, 'utf8'));
  }
  const make = await master('MAKE', 'KIA', 'Kia');
  const product = await master('PRODUCT', 'PASS', 'Passenger', make);
  const model = await master('MODEL', 'RIO', 'Rio', product);
  const variant = await master('VARIANT', 'RIO-AT', 'Automatic', model);
  const colour = await master('COLOUR', 'WHITE', 'White', model);
  await master('COLOUR', 'OLD', 'Old paint', model, false);
  await master('VARIANT', 'INACTIVE', 'Retired', model, false);
  await master('VARIANT', 'SPECIAL', '100%_Special', model);
  for (let i = 0; i < 60; i++) await master('VARIANT', `EXTRA-${String(i).padStart(2, '0')}`, 'Manual', model);
  const service = new WorkshopVehicleCatalog();
  let before = calls;
  assert.equal((await service.search('kia rio', 20, adapter)).items.length, 20);
  assert.equal(calls - before, 1);
  assert.deepEqual((await service.search('RIO-AT', 20, adapter)).items.map(item => item.id), [variant]);
  assert.equal((await service.search('%_', 20, adapter)).items.length, 1, 'Search wildcard characters are literal');
  before = calls;
  assert.deepEqual(await service.identity(adapter, variant, colour), {
    catalogueId: variant, colourId: colour, make: 'Kia', model: 'Rio', trim: 'Automatic', color: 'White',
    modelId: null, generationId: null, engineId: null, customMake: 'Kia', customModel: 'Rio',
  });
  assert.equal(calls - before, 1);
  await assert.rejects(service.identity(adapter, variant, randomUUID()), /belonging/);
  await db.query('UPDATE "WorkshopMaster" SET active=false WHERE id=$1', [make]);
  assert.equal((await service.search('', 20, adapter)).items.length, 0);
  assert.equal((await service.detail(variant, adapter)).active, false, 'Inactive saved entries remain displayable');
  await assert.rejects(service.identity(adapter, variant, colour), /active catalogue/);
  await assert.rejects(service.detail(randomUUID(), adapter), /not found/);
  console.log('PASS: bounded multi-token catalogue search, literal wildcard search, hierarchy labels, model colours, inactive ancestry, saved selection and one-query validation');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
