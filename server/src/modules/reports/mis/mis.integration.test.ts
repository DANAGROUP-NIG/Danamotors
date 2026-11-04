const dbUrl = process.env.TEST_DATABASE_URL;
if (dbUrl) process.env.DATABASE_URL = dbUrl;
import { ChargeType, Prisma } from '@prisma/client';
import prisma from '../../../prisma/client';
import { PERMISSIONS, ROLES } from '../../../shared/constants/roles';
import type { JWTPayload } from '../../../shared/types';
import { PartsReportService } from '../../parts-report/partsReport.service';
import { executeReport } from '../reports.controller';
import { REPORTS } from '../reports.registry';
import type { ReportDb, ReportResponse } from '../core/types';

const integration = dbUrl ? describe : describe.skip;

/** Rolls the whole test back: nothing is left in the database. */
class Rollback extends Error {}

const DAY = 86_400_000;
const at = (date: string, hour = 10) => new Date(`${date}T${String(hour - 1).padStart(2, '0')}:00:00.000Z`);

integration('Service MIS reports (#97) on a database', () => {
  it('returns the expected rows and totals for S1–S15 from one set of jobs', async () => {
    const run = `MIS${Date.now()}`;
    let checked = 0;
    await prisma
      .$transaction(
        async (tx) => {
          const f = await fixture(tx, run);
          const user: JWTPayload = { userId: f.advisor, email: `${run}@test.invalid`, role: ROLES.SUPER_ADMIN, branchId: f.branch, permissions: Object.values(PERMISSIONS) };
          const report = (slug: string, query: Record<string, unknown>) => {
            const definition = REPORTS.find((candidate) => candidate.slug === slug)!;
            return executeReport(tx as ReportDb, definition, user, definition.query.parse({ branchId: f.branch, ...query }) as Record<string, unknown>);
          };
          const row = (data: ReportResponse, id: string) => data.rows.find((candidate) => candidate.id === id)!;
          const period = { from: '2026-09-01', to: '2026-09-30' };

          // S1: four delivered jobs (free, paid, running repair + its repeat, PDI) in September; the open job is not counted.
          const monthly = await report('mis-monthly', { fromMonth: '2026-09', toMonth: '2026-09', annexure: 'true' });
          expect(row(monthly, 'VEHICLES:total').total).toBe(5);
          expect(row(monthly, 'LABOUR:gross').total).toBe(80_000);
          expect(row(monthly, 'LABOUR:discount').total).toBe(2_000);
          expect(row(monthly, 'LABOUR:pdi').total).toBe(5_000);
          expect(row(monthly, 'LABOUR:net').total).toBe(78_000);
          expect(row(monthly, 'LABOUR:total').total).toBe(83_000);
          expect(row(monthly, 'LABOUR:body').total).toBe(30_000);
          expect(row(monthly, 'OIL:total').total).toBe(27_500);
          // Days 1–10 only: the paid service (day 5) and the free service (day 3).
          const firstTen = await report('mis-monthly', { fromMonth: '2026-09', toMonth: '2026-09', fromDay: 1, toDay: 10 });
          expect(row(firstTen, 'VEHICLES:total').total).toBe(2);

          // S2 and S3 agree with S1.
          const mix = await report('business-product-mix', period);
          expect(mix.totals.vehicles).toBe(5);
          expect(mix.totals.labour).toBe(83_000);
          const byModel = await report('business-product-mix', { ...period, by: 'model' });
          expect(byModel.totals.labour).toBe(mix.totals.labour);
          expect(byModel.columns?.length).toBeGreaterThan(0);
          expect((await report('business-product-mix', { ...period, jobType: 'PDI' })).totals.vehicles).toBe(1);
          expect((await report('business-product-mix', { ...period, jobType: 'REGULAR' })).totals.vehicles).toBe(4);
          const analysis = await report('job-analysis', period);
          expect(analysis.totals).toMatchObject({ count: 5, repeat: 1 });

          // S4: labour lines in both service groups this year as on 30 Sep, net of the bill discount.
          const productivity = await report('group-productivity', { date: '2026-09-30' });
          expect(productivity.totals.ytdLines).toBe(6);
          expect(productivity.totals.ytdAmount).toBe(83_000);
          expect(productivity.rows.map((r) => r.label)).toEqual(expect.arrayContaining([`${run} BODY`, `${run} MAINT`]));

          // S5: billed jobs by engineer (the PDI has no bill), with the repeat and the late delivery.
          const engineers = await report('engineer-performance', period);
          expect(engineers.totals).toMatchObject({ jobs: 4, repeat: 1, late: 1 });
          const engineerFilter = await report('engineer-performance', { ...period, engineer: f.engineerB });
          expect(engineerFilter.totals.jobs).toBe(2);

          // S6: parts net of the return, split by charge type.
          const consumption = await report('engineer-part-consumption', period);
          expect(consumption.totals).toMatchObject({ amount: 27_500 + 24_000 + 21_000, nonWarranty: 27_500 + 24_000, warranty: 21_000, oil: 27_500 });
          const oilOnly = await report('engineer-part-consumption', { ...period, partKind: 'OIL' });
          expect(oilOnly.totals.amount).toBe(27_500);

          // S7: the returned brake pad, honouring the filters.
          const returns = await report('requisition-return-register', period);
          expect(returns.totals).toMatchObject({ count: 1, qtyReturned: 1, amount: 24_000 });
          expect((await report('requisition-return-register', { ...period, chargeTypes: 'WARRANTY' })).totals.count).toBe(0);
          expect((await report('requisition-return-register', { ...period, billing: 'UNBILLED' })).totals.count).toBe(0);
          expect((await report('requisition-return-register', { ...period, partNumber: `${run}-PAD` })).totals.count).toBe(1);

          // S8: coded major complaint and the free-text one.
          const problems = await report('major-problems', period);
          expect(problems.groups.map((g) => g.label)).toEqual(expect.arrayContaining(['Uncoded (free text)']));
          expect((await report('major-problems', { ...period, defects: 'MAJOR' })).totals.count).toBe(1);

          // S9: both customers' first jobs fall in September.
          expect((await report('new-customers', period)).totals.count).toBe(2);
          // S10: the Rio visited three times; the comeback 50 km later counts once with a 500 km difference.
          const regular = await report('regular-customers', { date: '2026-09-01', mileageDiff: 500, minVisits: 2 });
          expect(regular.rows).toEqual([expect.objectContaining({ registration: `${run}-R1`, visits: 2, allVisits: 3 })]);

          // S11: the birthday on 24 December is found by a range over the year end.
          const birthdays = await report('birthday-anniversary', { fromDay: 1, fromMonth: 12, toDay: 31, toMonth: 1, show: 'BOTH' });
          expect(birthdays.rows.map((r) => r.occasion)).toEqual(['BIRTHDAY', 'ANNIVERSARY']);

          // S12: the owner change after the first owner.
          const resale = await report('vehicle-resale', period);
          expect(resale.rows).toEqual([expect.objectContaining({ registration: `${run}-R2`, previousOwner: `${run} First`, newOwner: `${run} Second` })]);

          // S13: the Rio without its first free service is flagged; the serviced one is not.
          const skipped = await report('skipped-free-service', { from: '2026-08-01', to: '2026-08-31', freeService: f.freeService });
          expect(skipped.rows.map((r) => r.registration)).toEqual([`${run}-R2`]);
          expect(skipped.totals.sold).toBe(2);

          // S14: the two sold vehicles, and the stock vehicle when asked.
          expect((await report('vehicle-list', { from: '2026-08-01', to: '2026-08-31' })).totals.count).toBe(2);
          expect((await report('vehicle-list', { from: '2026-08-01', to: '2026-08-31', includeStock: 'true' })).rows.some((r) => r.vin === `${run}-STOCK`)).toBe(true);

          // S15: workshop lines from the same jobs; parts sections agree with the parts reports.
          const mir = await report('management-information', period);
          expect(row(mir, 'a1-labour').total).toBe(mix.totals.labour);
          expect(row(mir, 'a2-total').total).toBe(5);
          expect(row(mir, 'a4-repeat').total).toBe(1);
          expect(row(mir, 'e-workshop').total).toBe(f.billed);
          const parts = new PartsReportService();
          expect(row(mir, 'f-out').total).toBe((await parts.run('stn-register', { ...period, branchId: f.branch, option: 'STN' })).totals.amount ?? 0);
          checked = 15;
          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 10_000 },
      )
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
    expect(checked).toBe(15);
  }, 180_000);
});

/** One branch with the jobs, parts, complaints, owners and vehicles the assertions above describe. */
async function fixture(tx: Prisma.TransactionClient, run: string) {
  const branch = (await tx.branch.create({ data: { name: `${run} branch` } })).id;
  const role = async (name: string) => (await tx.role.findUniqueOrThrow({ where: { name } })).id;
  const user = async (key: string, roleName: string) =>
    (await tx.user.create({ data: { email: `${run}-${key}@test.invalid`, passwordHash: 'x', firstName: run, lastName: key, roleId: await role(roleName), branchId: branch } })).id;
  const advisor = await user('advisor', ROLES.SERVICE_ADVISOR);
  const engineerA = await user('engineerA', ROLES.ENGINEER);
  const engineerB = await user('engineerB', ROLES.ENGINEER);

  const master = async (kind: string, code: string, data: Partial<Prisma.WorkshopMasterUncheckedCreateInput> = {}) =>
    (await tx.workshopMaster.create({ data: { kind, code: `${run}${code}`, description: `${run} ${code}`, ...data } })).id;
  const system = await master('VEHICLE_SYSTEM', 'SYS');
  const maint = await master('VEHICLE_GROUP', 'MAINT', { parentId: system, description: `${run} MAINT` });
  const body = await master('VEHICLE_GROUP', 'BODY', { parentId: system, description: `${run} BODY`, attributes: { bodyRepair: true } });
  const product = await master('PRODUCT', 'P', { parentId: await master('MAKE', 'MK') });
  const model = await master('MODEL', 'RIO', { parentId: product });
  const variant = await master('VARIANT', 'RIOAT', { parentId: model });
  const types = {
    free: await master('SERVICE_TYPE', '1F', { category: 'FREE', freeService: true, chargedTo: 'COMPANY' }),
    paid: await master('SERVICE_TYPE', 'RG', { category: 'PAID' }),
    running: await master('SERVICE_TYPE', 'RR', { category: 'RUNNING_REPAIR' }),
    pdi: await master('SERVICE_TYPE', 'PD', { category: 'PDI', preDelivery: true }),
  };
  await tx.serviceTypeModelSetting.create({ data: { serviceTypeId: types.free, modelId: model, serviceCharge: 0, daysLimit: 30, mileageLimit: 1000 } });
  const major = await master('COMPLAINT', 'EN', { parentId: maint, attributes: { majorDefect: true } });
  const labour = {
    service: (await tx.labourItem.create({ data: { code: `${run}-SVC`, description: 'Service', defaultHours: 1, rate: 10_000, serviceGroupId: maint } })).id,
    panel: (await tx.labourItem.create({ data: { code: `${run}-PNL`, description: 'Panel', defaultHours: 1, rate: 15_000, serviceGroupId: body } })).id,
  };
  const part = (suffix: string, partType: string, retailRate: number) =>
    tx.sparePart.create({ data: { partNumber: `${run}-${suffix}`, name: suffix, uom: 'PCS', unitPrice: retailRate, retailRate, warrantyRate: retailRate - 3_000, partFlag: 'O', partType, warrantyApplicable: true } });
  const oil = await part('OIL', 'O', 27_500);
  const pad = await part('PAD', 'S', 24_000);

  const customer = async (name: string, extra: Partial<Prisma.CustomerUncheckedCreateInput> = {}) =>
    (await tx.customer.create({ data: { firstName: run, lastName: name, type: 'INDIVIDUAL', branchId: branch, ...extra } })).id;
  const first = await customer('First', { dateOfBirth: new Date('1980-12-24T00:00:00Z'), anniversaryOn: new Date('2010-01-05T00:00:00Z') });
  const second = await customer('Second');
  const vehicle = (suffix: string, customerId: string | null, saleDate: Date | null) =>
    tx.vehicle.create({ data: { vin: `${run}-${suffix === 'STOCK' ? 'STOCK' : `V${suffix}`}`, registrationNumber: suffix === 'STOCK' ? null : `${run}-${suffix}`, customerId, catalogueId: variant, customMake: 'Kia', customModel: 'Rio', saleDate } });
  const rio1 = await vehicle('R1', first, at('2026-08-05'));
  const rio2 = await vehicle('R2', first, at('2026-08-10'));
  const stock = await vehicle('STOCK', null, null);
  await tx.vehicleOwnership.create({ data: { vehicleId: rio2.id, customerId: first, purchaseDate: at('2026-08-10'), saleDate: at('2026-09-15'), status: 'Previous' } });
  await tx.vehicleOwnership.create({ data: { vehicleId: rio2.id, customerId: second, purchaseDate: at('2026-09-15'), status: 'Current', createdById: advisor } });

  let billed = 0;
  const job = async (
    key: string,
    o: { vehicle: string; customer: string | null; type: string; engineer: string; opened: string; delivered?: string; mileage: number; late?: boolean; repeat?: string },
    lines: { item: string; hours: number }[],
    partsUsed: { id: string; qty: number; rate: number; chargeType?: ChargeType; returned?: number }[] = [],
    bill?: { labourDiscount: number },
  ) => {
    const delivered = o.delivered ? at(o.delivered, 16) : null;
    const card = await tx.jobCard.create({
      data: {
        jobNumber: `${run}-${key}`, description: key, branchId: branch, vehicleId: o.vehicle, customerId: o.customer, serviceTypeId: o.type, engineerId: o.engineer, mileage: o.mileage,
        status: delivered ? 'DELIVERED' : 'IN_PROGRESS', createdAt: at(o.opened, 9), billedAt: delivered && o.type !== types.pdi ? delivered : null, deliveredAt: delivered,
        promisedAt: delivered ? new Date(delivered.getTime() + (o.late ? -DAY : DAY)) : null, isRepeat: Boolean(o.repeat), previousJobId: o.repeat ?? null, warrantyStatusAtCreation: 'ACTIVE',
      },
    });
    for (const line of lines) {
      const rate = line.item === labour.panel ? 15_000 : 10_000;
      await tx.jobCardLabour.create({ data: { jobCardId: card.id, labourItemId: line.item, description: 'line', hours: line.hours, rate, amount: rate * line.hours } });
    }
    for (const used of partsUsed) {
      const chargeType = used.chargeType ?? ChargeType.CUSTOMER;
      const requisition = await tx.partRequisition.create({ data: { requisitionNumber: `${run}-RQ-${key}-${used.id.slice(0, 4)}`, requisitionDate: at(o.opened, 11), branchId: branch, jobCardId: card.id, chargeType, engineerId: o.engineer, status: 'ISSUED', createdById: advisor } });
      const issuance = await tx.partIssuance.create({ data: { branchId: branch, sparePartId: used.id, jobCardId: card.id, issuedById: advisor, quantity: used.qty, issuedAt: at(o.opened, 11) } });
      const amount = used.rate * used.qty;
      const line = await tx.partRequisitionLine.create({ data: { requisitionId: requisition.id, sparePartId: used.id, partIssuanceId: issuance.id, partSource: 'O', description: 'part', quantityRequired: used.qty, quantityIssued: used.qty, rate: used.rate, amount, approvedAmount: 0, customerAmount: amount } });
      const net = used.qty - (used.returned ?? 0);
      await tx.jobCardLine.create({ data: { jobCardId: card.id, kind: 'PART', sparePartId: used.id, requisitionLineId: line.id, description: 'part', quantity: net, rate: used.rate, amount: used.rate * net, chargeType } });
      if (used.returned) {
        const slip = await tx.partReturnSlip.create({ data: { returnNumber: `${run}-RT-${key}`, returnDate: at(o.opened, 13), branchId: branch, jobCardId: card.id, requisitionId: requisition.id, status: 'COMPLETED', createdById: advisor } });
        await tx.partReturn.create({ data: { returnSlipId: slip.id, requisitionLineId: line.id, partIssuanceId: issuance.id, returnedById: advisor, quantity: used.returned, returnedAt: at(o.opened, 13), status: 'Completed', rate: used.rate, amount: used.rate * used.returned, reason: 'Not needed' } });
      }
    }
    if (bill && delivered && o.customer) {
      const total = 50_000;
      billed += total;
      await tx.invoice.create({ data: { invoiceNumber: `${run}-INV-${key}`, customerId: o.customer, jobCardId: card.id, issuedDate: delivered, subtotal: total, tax: 0, total, partsTotal: 0, labourTotal: 0, labourDiscountAmount: bill.labourDiscount, outstandingAmount: total, status: 'Unpaid' } });
    }
    return card.id;
  };

  // September: free service (day 3), paid with discount and a late delivery (day 5), running repair with body work,
  // a returned pad and complaints (day 15), its repeat on warranty (day 20), PDI on the stock vehicle (day 25).
  await job('FREE', { vehicle: rio1.id, customer: first, type: types.free, engineer: engineerA, opened: '2026-09-03', delivered: '2026-09-03', mileage: 800 }, [{ item: labour.service, hours: 1 }], [{ id: oil.id, qty: 1, rate: 27_500 }]);
  await job('PAID', { vehicle: rio1.id, customer: first, type: types.paid, engineer: engineerA, opened: '2026-09-05', delivered: '2026-09-05', mileage: 850, late: true }, [{ item: labour.service, hours: 2 }], [], { labourDiscount: 2_000 });
  const running = await job(
    'RR',
    { vehicle: rio2.id, customer: second, type: types.running, engineer: engineerB, opened: '2026-09-15', delivered: '2026-09-15', mileage: 1_500 },
    [{ item: labour.service, hours: 1 }, { item: labour.panel, hours: 2 }],
    [{ id: pad.id, qty: 2, rate: 24_000, returned: 1 }],
    { labourDiscount: 0 },
  );
  await tx.jobComplaint.createMany({ data: [{ jobCardId: running, complaintCodeId: major, description: 'Knocking' }, { jobCardId: running, description: 'Rattle in the door' }] });
  await job('REPEAT', { vehicle: rio2.id, customer: second, type: types.running, engineer: engineerB, opened: '2026-09-20', delivered: '2026-09-20', mileage: 1_520, repeat: running }, [{ item: labour.service, hours: 1 }], [{ id: pad.id, qty: 1, rate: 21_000, chargeType: ChargeType.WARRANTY }]);
  await job('PDI', { vehicle: stock.id, customer: null, type: types.pdi, engineer: engineerA, opened: '2026-09-25', delivered: '2026-09-25', mileage: 5 }, [{ item: labour.service, hours: 0.5 }]);
  // Rio 1 comes back 50 km later (counts once with a 500 km difference), then an open job.
  await job('OPEN', { vehicle: rio1.id, customer: first, type: types.paid, engineer: engineerA, opened: '2026-09-28', mileage: 1_400 }, [{ item: labour.service, hours: 0.5 }]);
  return { branch, advisor, engineerA, engineerB, freeService: types.free, billed };
}
