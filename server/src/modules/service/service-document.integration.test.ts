import { PrismaClient } from "@prisma/client";
import type { ServiceDocumentService } from "./service-document.service";
import type { ServiceDocumentActor } from "./service-document.logic";
import { estimateContentHash, signatureState } from "./estimate-signature";

jest.setTimeout(60000);
const database = process.env.TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite("service document actions on disposable localhost", () => {
  let db: PrismaClient,
    service: ServiceDocumentService,
    actor: ServiceDocumentActor;
  let branchId: string,
    otherBranchId: string,
    customerId: string,
    vehicleId: string,
    partId: string;
  const run = Date.now().toString();
  let sequence = 0;
  beforeAll(async () => {
    if (
      !database ||
      !["127.0.0.1", "localhost"].includes(new URL(database).hostname)
    )
      throw new Error("Service document tests require disposable localhost");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    service =
      new (require("./service-document.service").ServiceDocumentService)();
    branchId = (
      await db.branch.create({ data: { name: `Documents fixture ${run}` } })
    ).id;
    otherBranchId = (
      await db.branch.create({ data: { name: `Documents other ${run}` } })
    ).id;
    const role = await db.role.upsert({
      where: { name: "ServiceAdviser" },
      update: {},
      create: { name: "ServiceAdviser" },
    });
    const user = await db.user.create({
      data: {
        firstName: "Synthetic",
        lastName: "Document staff",
        email: `documents-${run}@example.test`,
        passwordHash: "test-fixture-not-a-login-hash",
        branchId,
        roleId: role.id,
      },
    });
    actor = { userId: user.id, branchId, allBranches: false };
    customerId = (
      await db.customer.create({
        data: {
          firstName: "Synthetic",
          lastName: "Document customer",
          branchId,
        },
      })
    ).id;
    vehicleId = (
      await db.vehicle.create({
        data: {
          vin: `DOCUMENTS-${run}`,
          customerId,
          registrationNumber: `DOC-${run}`,
          model: "Synthetic model",
          trim: "Synthetic variant",
          // Vehicles need a catalogue entry or a custom model (Vehicle_model_identity_check).
          customModel: "Synthetic model",
        },
      })
    ).id;
    partId = (
      await db.sparePart.create({
        data: {
          partCode: `DOC-${run}`,
          partNumber: `DOC-${run}`,
          name: "Current catalogue name",
          unitPrice: 999,
          uom: "UNIT",
          partFlag: "O",
        },
      })
    ).id;
    await db.inventoryStock.create({
      data: { branchId, partId, quantity: 20 },
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  async function fixture(status = "OPEN") {
    const job = await db.jobCard.create({
      data: {
        branchId,
        customerId,
        vehicleId,
        jobNumber: `DOC-JOB-${run}-${++sequence}`,
        description: "Synthetic job",
        remarks: "Original job remarks",
        workDone: "Original work done",
        status,
        mileage: 1234,
      },
    });
    const estimate = await db.estimate.create({
      data: {
        branchId,
        jobCardId: job.id,
        customerId,
        vehicleId,
        estimateNumber: `DOC-EST-${run}-${sequence}`,
        description: "Synthetic estimate",
        remarks: "Original estimate remarks",
        amount: 10.3,
        status: "Approved",
        lines: {
          create: [
            {
              type: "PART",
              referenceId: partId,
              partSource: "L",
              description: "Snapshot filter",
              quantity: 1,
              rate: 0.1,
              amount: 0.1,
            },
            {
              type: "INCLUDED_PART",
              referenceId: partId,
              partSource: "F",
              description: "Included oil",
              quantity: 2,
              rate: 0.1,
              amount: 0.2,
            },
            {
              type: "LABOUR",
              description: "Labour excluded from picking",
              quantity: 1,
              rate: 10,
              amount: 10,
            },
          ],
        },
      },
      include: { lines: true },
    });
    return { job, estimate };
  }
  it.each(["OPEN", "BILLED", "DELIVERED", "CANCELLED"])(
    "edits job remarks on %s without touching status, work done or money",
    async (status) => {
      const { job } = await fixture(status);
      await service.updateRemarks(
        "job",
        job.id,
        {
          remarks: "  Amended job remarks  ",
          customerRemarks: "  Customer explanation  ",
        },
        actor,
      );
      const saved = await db.jobCard.findUniqueOrThrow({
        where: { id: job.id },
      });
      expect(saved).toMatchObject({
        remarks: "Amended job remarks",
        customerRemarks: "Customer explanation",
        status,
        workDone: job.workDone,
        mileage: job.mileage,
        qcStatus: job.qcStatus,
      });
      expect((await service.getRemarks("job", job.id, actor)).remarks).toBe(
        "Amended job remarks",
      );
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: "JOB_REMARKS_UPDATED", details: { contains: job.id } },
      });
      expect(JSON.parse(audit.details!)).toMatchObject({
        oldValue: "Original job remarks",
        newValue: "Amended job remarks",
        branchId,
      });
      expect(audit.userId).toBe(actor.userId);
      expect(JSON.parse(audit.details!).customerRemarks).toMatchObject({
        oldValue: null,
        newValue: "Customer explanation",
      });
    },
  );
  it.each(["Pending", "Approved", "Rejected", "SUPERSEDED"])(
    "edits estimate remarks on %s without invalidating signed content",
    async (status) => {
      const { estimate } = await fixture("DELIVERED");
      await db.estimate.update({
        where: { id: estimate.id },
        data: { status },
      });
      const signature = {
        estimateVersion: estimate.version,
        totalSigned: estimate.amount,
        contentHash: estimateContentHash(estimate),
      };
      await service.updateRemarks(
        "estimate",
        estimate.id,
        {
          remarks: "Estimate amendment",
          customerRemarks: "Estimate explanation",
        },
        actor,
      );
      const saved = await db.estimate.findUniqueOrThrow({
        where: { id: estimate.id },
        include: { lines: true },
      });
      expect(saved).toMatchObject({
        remarks: "Estimate amendment",
        customerRemarks: "Estimate explanation",
        status,
        amount: estimate.amount,
        version: estimate.version,
      });
      expect(saved.lines).toEqual(estimate.lines);
      expect(
        signatureState(saved, { signatureRequired: true, signature }),
      ).toBe("valid");
      const audit = await db.auditLog.findFirstOrThrow({
        where: {
          action: "ESTIMATE_REMARKS_UPDATED",
          details: { contains: estimate.id },
        },
      });
      expect(JSON.parse(audit.details!)).toMatchObject({
        oldValue: "Original estimate remarks",
        newValue: "Estimate amendment",
      });
    },
  );
  it("returns minimal read-only document context and keeps customer explanations separate", async () => {
    const { job, estimate } = await fixture("BILLED");
    const initial = await service.getRemarks("job", job.id, actor);
    expect(initial.customerRemarks).toBeNull();
    expect(initial.context).toMatchObject({
      documentNumber: job.jobNumber,
      customerName: "Synthetic Document customer",
      mileage: 1234,
      vehicle: { vin: `DOCUMENTS-${run}`, model: "Synthetic model" },
    });
    expect(initial.context).not.toHaveProperty("amount");
    const estimateContext = await service.getRemarks(
      "estimate",
      estimate.id,
      actor,
    );
    expect(estimateContext.context).toMatchObject({
      documentNumber: estimate.estimateNumber,
      jobNumber: job.jobNumber,
    });
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: job.remarks, customerRemarks: "Public explanation" },
      actor,
    );
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: "Internal amendment" },
      actor,
    );
    const saved = await service.getRemarks("job", job.id, actor);
    expect(saved).toMatchObject({
      remarks: "Internal amendment",
      customerRemarks: "Public explanation",
    });
    const before = await db.auditLog.count({
      where: { details: { contains: job.id }, action: "JOB_REMARKS_UPDATED" },
    });
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: saved.remarks, customerRemarks: "  Public explanation  " },
      actor,
    );
    expect(
      await db.auditLog.count({
        where: { details: { contains: job.id }, action: "JOB_REMARKS_UPDATED" },
      }),
    ).toBe(before);
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: saved.remarks, customerRemarks: "" },
      actor,
    );
    expect(
      (await service.getRemarks("job", job.id, actor)).customerRemarks,
    ).toBeNull();
  });

  it("exposes current customer explanations on a billed job without changing invoice amounts", async () => {
    const { job } = await fixture("BILLED");
    const invoice = await db.invoice.create({
      data: {
        invoiceNumber: `DOC-INV-${run}-${sequence}`,
        customerId,
        jobCardId: job.id,
        jobCards: { connect: { id: job.id } },
        subtotal: 10,
        total: 10,
        outstandingAmount: 10,
      },
    });
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: job.remarks, customerRemarks: "Billed explanation" },
      actor,
    );
    const { FinanceRepository } =
      await import("../finance/finance.repository.js");
    const bill = (await new FinanceRepository().findInvoiceById(
      invoice.id,
    )) as unknown as {
      total: number;
      jobCards: { customerRemarks: string | null }[];
    };
    expect(bill.total).toBe(10);
    expect(bill.jobCards[0]).toMatchObject({
      customerRemarks: "Billed explanation",
    });
    expect(bill.jobCards[0]).not.toHaveProperty("remarks");
  });

  it("supports clearing and no-op saves without false change audit entries", async () => {
    const { job } = await fixture();
    await service.updateRemarks("job", job.id, { remarks: null }, actor);
    await service.updateRemarks("job", job.id, { remarks: " " }, actor);
    expect((await service.getRemarks("job", job.id, actor)).remarks).toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: "JOB_REMARKS_UPDATED", details: { contains: job.id } },
      }),
    ).toBe(1);
    await expect(
      service.updateRemarks(
        "job",
        job.id,
        { remarks: "Text", amount: 1 } as { remarks: string },
        actor,
      ),
    ).rejects.toThrow();
  });
  it("enforces branch access on reads, writes and prints, including standalone estimates", async () => {
    const { job, estimate } = await fixture();
    const foreign = { ...actor, branchId: otherBranchId };
    for (const [kind, id] of [
      ["job", job.id],
      ["estimate", estimate.id],
    ] as const) {
      await expect(service.getRemarks(kind, id, foreign)).rejects.toMatchObject(
        { statusCode: 403 },
      );
      await expect(
        service.updateRemarks(
          kind,
          id,
          { remarks: "Denied", customerRemarks: "Denied explanation" },
          foreign,
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(
        service.pickingPrint(kind, id, foreign),
      ).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(
      service.updateRemarks(
        "job",
        job.id,
        { remarks: "Denied" },
        { ...actor, branchId: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: "All branch access" },
      { ...foreign, allBranches: true },
    );
    const standalone = await db.estimate.create({
      data: {
        branchId: otherBranchId,
        vehicleId,
        description: "Standalone",
        amount: 0,
      },
    });
    await expect(
      service.getRemarks("estimate", standalone.id, actor),
    ).rejects.toMatchObject({ statusCode: 403 });
    await service.updateRemarks(
      "estimate",
      standalone.id,
      { remarks: "Standalone remark" },
      { ...foreign, allBranches: true },
    );
    expect(
      (
        await service.pickingPrint("estimate", standalone.id, {
          ...foreign,
          allBranches: true,
        })
      ).estimate.remarks,
    ).toBe("Standalone remark");
    const unassigned = await db.estimate.create({
      data: { description: "Unassigned legacy", amount: 0 },
    });
    await expect(
      service.getRemarks("estimate", unassigned.id, {
        ...actor,
        allBranches: true,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("prints planned part snapshots and remarks, excluding labour, costs and customer details", async () => {
    const { job, estimate } = await fixture("BILLED");
    await service.updateRemarks(
      "job",
      job.id,
      { remarks: "Internal job note" },
      actor,
    );
    await service.updateRemarks(
      "estimate",
      estimate.id,
      { remarks: "Internal estimate note" },
      actor,
    );
    const print = await service.pickingPrint("estimate", estimate.id, actor);
    expect(print.job).toMatchObject({
      number: job.jobNumber,
      mileage: 1234,
      remarks: "Internal job note",
    });
    expect(print.estimate).toMatchObject({
      number: estimate.estimateNumber,
      remarks: "Internal estimate note",
      version: 1,
    });
    expect(print.vehicle).toMatchObject({
      vin: `DOCUMENTS-${run}`,
      model: "Synthetic model",
      trim: "Synthetic variant",
    });
    expect(print.totals).toEqual({
      numberOfItems: 2,
      quantityRequired: 3,
      totalAmount: 0.3,
    });
    expect(print.lines.find((line) => line.flag === "L")).toMatchObject({
      partNumber: `DOC-${run}`,
      description: "Snapshot filter",
      quantityRequired: 1,
      rate: 0.1,
      amount: 0.1,
      uom: "UNIT",
    });
    expect(print.timeZone).toBe("Africa/Lagos");
    const json = JSON.stringify(print);
    for (const field of [
      "customerId",
      "unitPrice",
      "supplier",
      "cost",
      "passwordHash",
      "chargeType",
    ])
      expect(json).not.toContain('"' + field + '":');
    expect(
      await db.auditLog.count({
        where: {
          action: "PICKING_LIST_PRINTED",
          details: { contains: estimate.id },
        },
      }),
    ).toBe(1);
  });
  it('prints saved checklist codes and free text without adding live checklist quantities', async () => {
    const { job, estimate } = await fixture();
    const code = `PICK-CHECK-${run}`;
    const checklist = await db.workshopMaster.create({ data: { kind: 'CHECKLIST', code, description: 'Historical checklist', active: false } });
    const model = await db.workshopMaster.create({ data: { kind: 'MODEL', code: `PICK-MODEL-${run}`, description: 'Checklist model' } });
    await db.serviceChecklistLine.create({ data: { checklistId: checklist.id, modelId: model.id, kind: 'PART', sparePartId: partId, quantity: 99 } });
    await db.jobCheckIn.upsert({ where: { jobCardId: job.id }, create: { jobCardId: job.id, checklistNote: `  ${code.toLowerCase()}  ` }, update: { checklistNote: `  ${code.toLowerCase()}  ` } });
    const print = await service.pickingPrint('job', job.id, actor);
    expect(print.checklist).toMatchObject({ code, description: 'Historical checklist' });
    expect(print.job?.date).toEqual(job.createdAt);
    expect(print.totals).toEqual({ numberOfItems: 2, quantityRequired: 3, totalAmount: 0.3 });
    await db.jobCheckIn.update({ where: { jobCardId: job.id }, data: { checklistNote: 'Inspect brakes and tyres' } });
    const freeText = await service.pickingPrint('estimate', estimate.id, actor);
    expect(freeText.checklist).toEqual({ code: null, description: null, text: 'Inspect brakes and tyres' });
    expect(freeText.totals.quantityRequired).toBe(3);
  });

  it("uses the latest job estimate and never sums issued warranty/customer payer shares", async () => {
    const { job, estimate } = await fixture();
    const revised = await db.estimate.create({
      data: {
        branchId,
        jobCardId: job.id,
        supersedesId: estimate.id,
        version: 2,
        description: "Latest estimate",
        amount: 0.4,
        lines: {
          create: [
            {
              type: "PART",
              referenceId: partId,
              description: "Latest parts",
              quantity: 4,
              rate: 0.1,
              amount: 0.4,
            },
          ],
        },
      },
    });
    await db.jobCardLine.createMany({
      data: [
        {
          jobCardId: job.id,
          kind: "PART",
          sparePartId: partId,
          description: "Warranty share",
          quantity: 4,
          rate: 0.05,
          amount: 0.2,
          chargeType: "WARRANTY",
        },
        {
          jobCardId: job.id,
          kind: "PART",
          sparePartId: partId,
          description: "Customer share",
          quantity: 4,
          rate: 0.05,
          amount: 0.2,
          chargeType: "CUSTOMER",
        },
      ],
    });
    const print = await service.pickingPrint("job", job.id, actor);
    expect(print.estimate.id).toBe(revised.id);
    expect(print.totals.quantityRequired).toBe(4);
    expect(
      (await service.pickingPrint("estimate", estimate.id, actor)).estimate.id,
    ).toBe(estimate.id);
  });
  it("printing changes only the audit log, with no stock, sequence, STN or business document writes", async () => {
    const { job } = await fixture("CANCELLED");
    const snapshot = async () => ({
      job: await db.jobCard.findUnique({ where: { id: job.id } }),
      estimates: await db.estimate.findMany({
        where: { jobCardId: job.id },
        include: { lines: true },
        orderBy: { id: "asc" },
      }),
      stocks: await db.inventoryStock.findMany({ where: { branchId } }),
      sequences: await db.documentSequence.findMany({
        orderBy: { key: "asc" },
      }),
      transactions: await db.stockTransaction.count(),
      issuances: await db.partIssuance.count(),
      returns: await db.partReturn.count(),
      picking: await db.pickingList.count(),
    });
    const before = await snapshot();
    await service.pickingPrint("job", job.id, actor);
    await service.pickingPrint("job", job.id, actor);
    expect(await snapshot()).toEqual(before);
  });
  it("returns clear missing-document errors and refuses to invent picking rows without an estimate", async () => {
    const missing = "00000000-0000-4000-8000-000000000001";
    await expect(
      service.getRemarks("job", missing, actor),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.updateRemarks("estimate", missing, { remarks: "Missing" }, actor),
    ).rejects.toMatchObject({ statusCode: 404 });
    const job = await db.jobCard.create({
      data: {
        branchId,
        jobNumber: `DOC-EMPTY-${run}`,
        description: "No estimate",
      },
    });
    await expect(service.pickingPrint("job", job.id, actor)).rejects.toThrow(
      "Create an estimate",
    );
  });
  it("serializes concurrent remarks edits and audits the immediately preceding value", async () => {
    const { job } = await fixture();
    await Promise.all([
      service.updateRemarks(
        "job",
        job.id,
        { remarks: "First concurrent" },
        actor,
      ),
      service.updateRemarks(
        "job",
        job.id,
        { remarks: "Second concurrent" },
        actor,
      ),
    ]);
    const audits = await db.auditLog.findMany({
      where: { action: "JOB_REMARKS_UPDATED", details: { contains: job.id } },
    });
    const values = audits.map(
      (row) =>
        JSON.parse(row.details!) as { oldValue: string; newValue: string },
    );
    expect(values).toHaveLength(2);
    const first = values.find(
      (row) => row.oldValue === "Original job remarks",
    )!;
    const second = values.find((row) => row.oldValue === first.newValue)!;
    expect(second).toBeDefined();
    expect((await service.getRemarks("job", job.id, actor)).remarks).toBe(
      second.newValue,
    );
  });
  it("rolls remarks back when the audit insert fails", async () => {
    const { job, estimate } = await fixture("DELIVERED");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION document_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('JOB_REMARKS_UPDATED','ESTIMATE_REMARKS_UPDATED') THEN RAISE EXCEPTION 'Synthetic remarks audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER document_test_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION document_test_failure()',
    );
    try {
      await expect(
        service.updateRemarks(
          "job",
          job.id,
          { remarks: "Rollback", customerRemarks: "Rollback explanation" },
          actor,
        ),
      ).rejects.toThrow("Synthetic remarks audit failure");
      await expect(
        service.updateRemarks(
          "estimate",
          estimate.id,
          { remarks: "Rollback", customerRemarks: "Rollback explanation" },
          actor,
        ),
      ).rejects.toThrow("Synthetic remarks audit failure");
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER document_test_failure ON "AuditLog"',
      );
      await db.$executeRawUnsafe("DROP FUNCTION document_test_failure()");
    }
    expect(await service.getRemarks("job", job.id, actor)).toMatchObject({
      remarks: "Original job remarks",
      customerRemarks: null,
    });
    expect(
      (await service.getRemarks("estimate", estimate.id, actor)).remarks,
    ).toBe("Original estimate remarks");
  });
});
