import type { PrismaClient } from '@prisma/client';
import type { PdiActor, PdiService } from './pdi.service';
import type { PdiBillService } from './pdi-bill.service';
import type { RequisitionService } from '../requisition/requisition.service';
import type { ReturnSlipService } from '../requisition/return-slip.service';
import type { LabourSlipService } from '../service/labour-slip.service';

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

describeDb('PDI flow on isolated local PostgreSQL', () => {
  let db: PrismaClient;
  let pdi: PdiService;
  let bills: PdiBillService;
  let requisitions: RequisitionService;
  let returns: ReturnSlipService;
  let slips: LabourSlipService;
  let actor: PdiActor;
  const ids: Record<string, string> = {};
  const run = `${Date.now()}`.slice(-8);
  const vin = (n: number) => `KNAPDIT${run}0${n}`;
  const docActor = () => ({ ...actor, goodwill: false, pdi: true, pdiOnly: true });
  const stockOf = async (partId: string) => (await db.inventoryStock.findUniqueOrThrow({ where: { branchId_partId: { branchId: ids.branch, partId } } })).quantity;

  beforeAll(async () => {
    if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) throw new Error('PDI tests require a disposable localhost database');
    process.env.DATABASE_URL = database;
    db = require('../../prisma/client').default;
    pdi = new (require('./pdi.service').PdiService)();
    bills = new (require('./pdi-bill.service').PdiBillService)();
    requisitions = new (require('../requisition/requisition.service').RequisitionService)();
    returns = new (require('../requisition/return-slip.service').ReturnSlipService)();
    slips = new (require('../service/labour-slip.service').LabourSlipService)();

    ids.branch = (await db.branch.create({ data: { name: `PDI fixture ${run}` } })).id;
    const role = async (name: string) => (await db.role.upsert({ where: { name }, update: {}, create: { name } })).id;
    const user = async (name: string, roleName: string) => (await db.user.create({ data: { firstName: 'Synthetic', lastName: name, email: `pdi-${name.toLowerCase()}-${run}@example.test`, passwordHash: 'test-fixture-not-a-login-hash', roleId: await role(roleName), branchId: ids.branch } })).id;
    ids.advisor = await user('Advisor', 'ServiceAdviser');
    ids.engineer = await user('Engineer', 'Engineer');
    ids.technician = await user('Technician', 'Technician');
    actor = { userId: ids.advisor, branchId: ids.branch, allBranches: false };
    ids.customer = (await db.customer.create({ data: { firstName: 'PDI', lastName: 'Internal', companyName: `PDI internal ${run}`, branchId: ids.branch } })).id;

    const master = async (kind: string, code: string, extra: Record<string, unknown> = {}) => (await db.workshopMaster.create({ data: { kind, code: `${code}-${run}`, description: `${kind} ${code}`, ...extra } })).id;
    const make = await master('MAKE', 'MK');
    const product = await master('PRODUCT', 'PR', { parentId: make });
    ids.model = await master('MODEL', 'MD', { parentId: product });
    ids.variant = await master('VARIANT', 'VR', { parentId: ids.model });
    ids.colour = await master('COLOUR', 'CL', { parentId: ids.model });
    ids.bay = await master('BAY', 'BY');
    ids.team = await master('TEAM', 'TM');
    ids.pdiType = await master('SERVICE_TYPE', 'PD', { preDelivery: true, category: 'PDI', chargedTo: 'COMPANY' });
    ids.paidType = await master('SERVICE_TYPE', 'RG', { category: 'PAID' });
    ids.defect = await master('PDI_DEFECT', 'DF');
    ids.tyreMake = await master('TYRE_MAKE', 'TY');
    await db.serviceTypeModelSetting.createMany({ data: [{ serviceTypeId: ids.pdiType, modelId: ids.model, serviceCharge: 0 }, { serviceTypeId: ids.paidType, modelId: ids.model, serviceCharge: 1000 }] });

    const part = async (code: string, warrantyApplicable: boolean) => {
      const row = await db.sparePart.create({ data: { partNumber: `PDI-${code}-${run}`, name: `PDI part ${code}`, unitPrice: 800, retailRate: 1000, warrantyRate: 900, warrantyApplicable, partFlag: 'O', partStatus: 'ACTIVE' } });
      await db.inventoryStock.create({ data: { branchId: ids.branch, partId: row.id, quantity: 10 } });
      return row.id;
    };
    ids.partWarranty = await part('W', true);
    ids.partFoc = await part('F', false);
    ids.labour = (await db.labourItem.create({ data: { code: `PDI-L-${run}`, description: 'PDI inspection', defaultHours: 1, rate: 5000 } })).id;
    await db.labourRate.create({ data: { labourItemId: ids.labour, modelId: ids.model, pricing: 'TIME', hours: 1, rate: 5000 } });
    await db.pdiSettings.upsert({ where: { id: 'default' }, update: { jobFreezeDate: null, requisitionFreezeDate: null, returnFreezeDate: null, labourFreezeDate: null, billFreezeDate: null, includeInHistory: false }, create: { id: 'default' } });
  });

  afterAll(async () => {
    await db?.pdiSettings.updateMany({ data: { jobFreezeDate: null, requisitionFreezeDate: null, includeInHistory: false } });
    await db?.$disconnect();
  });

  const openPdi = async (n: number) => {
    const vehicle = await pdi.createVehicle({ vin: vin(n), catalogueId: ids.variant, colourId: ids.colour, engineNumber: `ENG-${run}-${n}` }, ids.advisor);
    return pdi.open({
      branchId: ids.branch, vehicleId: vehicle.id, customerId: ids.customer, serviceTypeId: ids.pdiType, mileage: 10, bayId: ids.bay,
      serviceAdvisorId: ids.advisor, engineerId: ids.engineer, teamId: ids.team, promisedAt: new Date(Date.now() + 86_400_000).toISOString(),
      defects: [{ defectId: ids.defect, spare: 1000, oil: 200.5, labour: 5000 }, { description: 'Door trim loose', labour: 1500 }],
      tyres: [{ makeId: ids.tyreMake, number: 'T1' }, { makeId: ids.tyreMake, number: 'T2' }],
    }, actor);
  };

  it('opens a PDI → requisition → partial return → labour → ready → zero bill, with stock and PDI done', async () => {
    const job = await openPdi(1);
    expect(job.jobType).toBe('PDI');
    expect(job.jobNumber).toMatch(/^P\d{10}$/);
    expect(job.pdiRegistration).toBe(vin(1).slice(-6));
    expect(job.defectTotals).toEqual({ spare: 1000, oil: 200.5, labour: 6500, total: 7700.5 });
    const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: job.vehicle!.id } });
    expect(vehicle.registrationNumber).toBeNull();
    expect((vehicle.tyres as { make: string; number: string }[]).slice(0, 2).map(tyre => tyre.number)).toEqual(['T1', 'T2']);
    expect(await db.warrantyCase.count({ where: { jobCardId: job.id } })).toBe(0);

    const warranty = await requisitions.create({ branchId: ids.branch, jobCardId: job.id, chargeType: 'WARRANTY', lines: [{ sparePartId: ids.partWarranty, quantityRequired: 3, quantityIssued: 3 }] }, docActor());
    expect(warranty.requisitionNumber).toMatch(/^PW\d{10}$/);
    expect(warranty.mileage).toBe(10);
    expect(warranty.lines[0]).toMatchObject({ approvalPercent: expect.anything(), approvedAmount: expect.anything() });
    expect(warranty.lines[0].approvedAmount.toNumber()).toBe(2700);
    const foc = await requisitions.create({ branchId: ids.branch, jobCardId: job.id, chargeType: 'FREE', lines: [{ sparePartId: ids.partFoc, quantityRequired: 1, quantityIssued: 1 }] }, docActor());
    expect(foc.requisitionNumber).toMatch(/^P\d{10}$/);
    expect(await stockOf(ids.partWarranty)).toBe(7);

    await expect(returns.create({ requisitionId: warranty.id, lines: [{ requisitionLineId: warranty.lines[0].id, quantity: 4 }] }, docActor())).rejects.toThrow();
    const slip = await returns.create({ requisitionId: warranty.id, lines: [{ requisitionLineId: warranty.lines[0].id, quantity: 1 }] }, docActor());
    expect(slip.returnNumber).toMatch(/^P\d{10}$/);
    expect(await stockOf(ids.partWarranty)).toBe(8);
    await expect(returns.create({ requisitionId: warranty.id, lines: [{ requisitionLineId: warranty.lines[0].id, quantity: 3 }] }, docActor())).rejects.toThrow();

    const labour = await slips.create({ branchId: ids.branch, jobCardId: job.id, groupId: ids.team, engineerId: ids.engineer, lines: [{ labourItemId: ids.labour, chargeType: 'FREE', technicianId: ids.technician }] }, docActor());
    expect(labour.slipNumber).toMatch(/^P\d{10}$/);

    expect((await pdi.workDone(job.id, 'Defects fixed', actor)).status).toBe('QC');
    const ready = await pdi.vehicleReady(job.id, undefined, actor);
    expect(ready.status).toBe('READY');
    expect(ready.summary.labour.foc).toBe(5000);

    const preview = await bills.preview({ jobCardId: job.id, partsDiscountPercent: 0, labourDiscountPercent: 0 }, actor);
    expect(preview.split.chargeableTotal).toBe(0);
    expect(preview.suggestedBillType).toBe('ZERO');
    await expect(bills.create({ jobCardId: job.id, billType: 'CASH', deliveryAdvisorId: ids.advisor, partsDiscountPercent: 0, labourDiscountPercent: 0 }, actor)).rejects.toThrow('zero bill');
    const bill = await bills.create({ jobCardId: job.id, billType: 'ZERO', deliveryAdvisorId: ids.advisor, partsDiscountPercent: 0, labourDiscountPercent: 0 }, actor);
    expect(bill.invoiceNumber).toMatch(/^P\d{10}$/);
    expect(bill.total).toBe(0);
    expect(bill.printTitle).toBe('PDI CASH MEMO');

    const billed = await db.jobCard.findUniqueOrThrow({ where: { id: job.id }, include: { vehicle: true } });
    expect(billed.status).toBe('BILLED');
    expect(billed.vehicle).toMatchObject({ pdiDone: true });
    expect(billed.vehicle?.pdiDate).toBeInstanceOf(Date);
    expect(await stockOf(ids.partWarranty)).toBe(8);
    expect(await stockOf(ids.partFoc)).toBe(9);
    await expect(requisitions.create({ branchId: ids.branch, jobCardId: job.id, chargeType: 'FREE', lines: [{ sparePartId: ids.partFoc, quantityRequired: 1, quantityIssued: 1 }] }, docActor())).rejects.toThrow('billed');
  });

  it('keeps PDI numbering apart from service job numbers', async () => {
    const job = await openPdi(2);
    const service = await db.jobCard.findFirst({ where: { jobType: 'SERVICE' }, select: { jobNumber: true } });
    expect(job.jobNumber.startsWith('P')).toBe(true);
    if (service) expect(service.jobNumber).not.toBe(job.jobNumber);
    expect(await db.documentSequence.findFirst({ where: { key: { startsWith: 'PDI_JOB_CARD_' } } })).not.toBeNull();
  });

  it('leaves the PDI job out of the vehicle service history unless the setting includes it', async () => {
    const job = await openPdi(3);
    const vehicleId = job.vehicle!.id;
    await db.jobCard.create({ data: { branchId: ids.branch, customerId: ids.customer, vehicleId, serviceTypeId: ids.paidType, jobNumber: `SVC-${run}`, description: 'Service visit', status: 'DELIVERED' } });
    const { VehicleRepository } = require('../vehicle/vehicle.repository');
    const history = await new VehicleRepository().findVehicleById(vehicleId);
    expect(history.jobCards.map((row: { jobNumber: string }) => row.jobNumber)).toEqual([`SVC-${run}`]);
    const withPdi = await new VehicleRepository().findVehicleById(vehicleId, true);
    expect(withPdi.jobCards).toHaveLength(2);
    const { jobScope } = require('../reports/report.repository');
    expect(await db.jobCard.count({ where: { ...jobScope({}), vehicleId } })).toBe(1);
    expect((await pdi.vehiclePdiJobs(vehicleId, actor)).map(row => row.jobNumber)).toEqual([job.jobNumber]);
  });

  it('rejects PDI service types on a service job card', async () => {
    const { JobCardWorkflowService } = require('../service/job-card-workflow.service');
    const vehicle = await pdi.createVehicle({ vin: vin(4), catalogueId: ids.variant, colourId: ids.colour, engineNumber: `ENG-${run}-4` }, ids.advisor);
    const branch = await db.branch.findUniqueOrThrow({ where: { id: ids.branch } });
    await expect(new JobCardWorkflowService().open({
      createdById: ids.advisor, branchName: branch.name, customerId: ids.customer, vehicleId: vehicle.id, serviceTypeId: ids.pdiType,
      description: 'Should fail', mileage: 10, bayId: ids.bay, serviceAdvisorId: ids.advisor, teamId: ids.team,
      promisedAt: new Date(Date.now() + 86_400_000).toISOString(), complaints: [{ description: 'x' }],
    })).rejects.toThrow('PDI menu');
  });

  it('blocks edits on or before a freeze date and after print', async () => {
    const job = await openPdi(5);
    await db.pdiSettings.update({ where: { id: 'default' }, data: { jobFreezeDate: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) } });
    await expect(pdi.update(job.id, { remarks: 'late edit' }, actor)).rejects.toThrow('frozen');
    await db.pdiSettings.update({ where: { id: 'default' }, data: { jobFreezeDate: null } });
    expect((await pdi.update(job.id, { remarks: 'allowed edit' }, actor)).remarks).toBe('allowed edit');

    const requisition = await requisitions.create({ branchId: ids.branch, jobCardId: job.id, chargeType: 'CUSTOMER', lines: [{ sparePartId: ids.partFoc, quantityRequired: 1, quantityIssued: 1 }] }, docActor());
    await pdi.markPrinted('requisition', requisition.id, actor);
    await expect(requisitions.cancel(requisition.id, 'wrong part', docActor())).rejects.toThrow('after it has been printed');
  });
});
