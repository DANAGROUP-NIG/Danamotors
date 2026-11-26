import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobStageService } from "./job-stage.service";
import type { JobWarrantyService } from "./job-warranty.service";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(90000);

// A 1 x 1 PNG: the smallest photo the server accepts.
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const DAY = 86_400_000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY + 3_600_000).toISOString().slice(0, 10);

describeDb("Warranty check on isolated local PostgreSQL (job card revamp phase 4)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let stages: JobStageService;
  let warranty: JobWarrantyService;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let periodicId: string;
  let variantId: string;
  let vehicleModelId: string;
  let customerId: string;
  let labourId: string;
  let compressorId: string;
  let wiperId: string;
  type Key = "advisor" | "officer" | "otherOfficer" | "technician";
  const users: Record<Key, { id: string; role: string }> = {} as never;
  const officerAccess = { canUpdate: true, canDecide: true };

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Warranty check tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    stages = new (require("./job-stage.service").JobStageService)();
    warranty = new (require("./job-warranty.service").JobWarrantyService)();
    branchName = `Warranty check fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `wty-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("officer", "WarrantyOfficer");
    await person("otherOfficer", "WarrantyOfficer");
    await person("technician", "Technician");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `WT-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `WT-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    periodicId = (
      await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `WT-S-${run}`, description: "Periodic service", isPeriodicMaintenance: true } })
    ).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId: periodicId, modelId, serviceCharge: 0 } });
    vehicleModelId = (
      await db.vehicleModel.create({ data: { code: `WT-SPG-${run}`, name: `Sportage ${run}`, warrantyDays: 1825, warrantyKm: 100_000 } })
    ).id;
    labourId = (await db.labourItem.create({ data: { code: `WT-L-${run}`, description: "Replace AC compressor", rate: 30000 } })).id;
    compressorId = (
      await db.sparePart.create({ data: { partNumber: `WT-P-${run}`, name: "AC compressor", taxCategory: "A", warrantyApplicable: true } })
    ).id;
    wiperId = (await db.sparePart.create({ data: { partNumber: `WT-W-${run}`, name: "Rear wiper blade", taxCategory: "A", warrantyApplicable: false } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const open = (vehicleId: string, mileage: number, description: string) =>
    workflow.open({
      branchName,
      customerId,
      vehicleId,
      serviceTypeId: periodicId,
      serviceAdvisorId: users.advisor.id,
      description,
      mileage,
      promisedAt: new Date(Date.now() + 2 * DAY).toISOString(),
      complaints: [{ description }],
      createdById: users.advisor.id,
      warrantyAcknowledged: true,
    });

  /**
   * A vehicle sold 400 days ago in warranty with two delivered periodic services (day 80 at
   * 4,000 km, day 300 at 9,000 km) and a job now at the warranty check with three diagnosed items.
   */
  async function jobAtWarranty() {
    const vehicle = await db.vehicle.create({
      data: {
        vin: `WTY${run}${randomUUID().slice(0, 6)}`,
        customerId,
        catalogueId: variantId,
        customModel: "Synthetic Sportage",
        vehicleModelId,
        saleDate: new Date(Date.now() - 400 * DAY),
      },
    });
    for (const [daysAgo, mileage] of [
      [320, 4_000],
      [100, 9_000],
    ] as const) {
      const past = await open(vehicle.id, mileage, "Periodic service");
      await db.jobCard.update({
        where: { id: past.id },
        data: { stage: "CLOSED", status: "DELIVERED", createdAt: new Date(Date.now() - daysAgo * DAY), deliveredAt: new Date(Date.now() - daysAgo * DAY + DAY) },
      });
      await db.warrantyCase.deleteMany({ where: { jobCardId: past.id } });
    }
    const job = await open(vehicle.id, 12_000, "AC not cooling well");
    await db.jobCard.update({ where: { id: job.id }, data: { stage: "WARRANTY", stageOwnerId: null, stageOwnerRole: "WarrantyOfficer" } });
    const complaint = await db.jobComplaint.findFirstOrThrow({ where: { jobCardId: job.id } });
    const finding = await db.jobFinding.create({
      data: { jobCardId: job.id, complaintId: complaint.id, causeAndDefect: "Compressor clutch not engaging.", possibleWarranty: true, createdById: users.technician.id },
    });
    const extra = await db.jobFinding.create({
      data: { jobCardId: job.id, complaintId: null, causeAndDefect: "Rear wiper blade torn.", createdById: users.technician.id },
    });
    const [compressor, labour, wiper] = await Promise.all([
      db.jobFindingItem.create({ data: { findingId: finding.id, kind: "PART", referenceId: compressorId, description: "AC compressor", quantity: 1, sortOrder: 0 } }),
      db.jobFindingItem.create({ data: { findingId: finding.id, kind: "LABOUR", referenceId: labourId, description: "Replace AC compressor", quantity: 1, sortOrder: 1 } }),
      db.jobFindingItem.create({ data: { findingId: extra.id, kind: "PART", referenceId: wiperId, description: "Rear wiper blade", quantity: 1, sortOrder: 0 } }),
    ]);
    return { id: job.id, jobNumber: job.jobNumber, vehicleId: vehicle.id, items: { compressor: compressor.id, labour: labour.id, wiper: wiper.id } };
  }

  it("evidence, decisions, gates, outside records and the handoff that opens the warranty case", async () => {
    const job = await jobAtWarranty();

    // Evidence: covered at opening; services on day 80 and day 300 leave two gaps over 3 months.
    let check = await warranty.get(job.id, users.officer, officerAccess);
    expect(check.editable).toBe(true);
    expect(check.coverage.status).toBe("ACTIVE");
    expect(check.history?.services.map((row) => row.mileage)).toEqual([4_000, 9_000]);
    expect(check.history?.verdict).toMatchObject({ kind: "IRREGULAR" });
    const missedBefore = check.history?.verdict.kind === "IRREGULAR" ? check.history.verdict.missedCount : 0;
    expect(missedBefore).toBeGreaterThanOrEqual(2);
    expect(check.items.map((row) => [row.description, row.payer, row.request])).toEqual([
      ["AC compressor", null, "AC not cooling well"],
      ["Replace AC compressor", null, "AC not cooling well"],
      ["Rear wiper blade", null, null],
    ]);
    expect(check.problems).toEqual(["Choose who pays for every item (3 of 3 not decided yet)."]);

    // Someone else reads it but cannot decide.
    const advisorView = await warranty.get(job.id, users.advisor, { canUpdate: true, canDecide: false });
    expect(advisorView).toMatchObject({ editable: false, readOnlyReason: "Only the warranty officer can decide who pays." });
    await expect(
      warranty.saveDecisions(job.id, { items: [{ itemId: job.items.compressor, payer: "WARRANTY" }] }, users.technician, officerAccess),
    ).rejects.toMatchObject({ statusCode: 403, code: "WARRANTY_LOCKED" });

    // The job card line rules: a part that cannot be claimed is refused, naming the item.
    await expect(
      warranty.saveDecisions(job.id, { items: [{ itemId: job.items.wiper, payer: "WARRANTY" }] }, users.officer, officerAccess),
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { field: "items.0.payer" },
      message: "Rear wiper blade: This part is not warranty-applicable, so it cannot be charged to warranty.",
    });

    check = await warranty.saveDecisions(
      job.id,
      {
        items: [
          { itemId: job.items.compressor, payer: "WARRANTY" },
          { itemId: job.items.labour, payer: "WARRANTY" },
          { itemId: job.items.wiper, payer: "CUSTOMER" },
        ],
      },
      users.officer,
      officerAccess,
    );
    expect(check.items.map((row) => [row.payer, row.decidedBy])).toEqual([
      ["WARRANTY", "officer Synthetic"],
      ["WARRANTY", "officer Synthetic"],
      ["CUSTOMER", "officer Synthetic"],
    ]);
    expect(check.reasonNeeded).toBe(true);
    expect(check.problems).toEqual(["Write a reason, because the service history is not regular and items are set to warranty or goodwill."]);

    // The handoff is blocked through the single stage path until the reason is written.
    await expect(stages.act(job.id, { action: "WARRANTY_TO_ADVISOR", requestId: randomUUID() }, users.officer)).rejects.toMatchObject({
      statusCode: 409,
      code: "STAGE_ACTION_BLOCKED",
      details: { reasons: ["Write a reason, because the service history is not regular and items are set to warranty or goodwill."] },
    });
    check = await warranty.saveDecisions(job.id, { items: [], reason: "Missed service is not related to the AC system" }, users.officer, officerAccess);
    expect(check.problems).toEqual([]);

    // An outside record 90 days after the first service splits the 220-day gap (2 missed) into
    // 90 days (on time) and 130 days (1 missed): one fewer missed service. A retry stores it once.
    const requestId = randomUUID();
    const record = { requestId, serviceDate: isoDaysAgo(230), mileage: 6_500, dealerName: "Kia Ikeja", note: "Stamp on page 4", image: PHOTO };
    await expect(warranty.addOutsideRecord(job.id, { ...record, image: "data:image/gif;base64,R0lGOD" }, users.officer, officerAccess)).rejects.toMatchObject({
      statusCode: 400,
      details: { field: "image" },
    });
    await expect(warranty.addOutsideRecord(job.id, { ...record, serviceDate: isoDaysAgo(-2) }, users.officer, officerAccess)).rejects.toMatchObject({
      statusCode: 400,
      details: { field: "serviceDate" },
      message: "The service date cannot be in the future",
    });
    check = await warranty.addOutsideRecord(job.id, record, users.officer, officerAccess);
    await warranty.addOutsideRecord(job.id, record, users.officer, officerAccess);
    expect(await db.externalServiceRecord.count({ where: { vehicleId: job.vehicleId } })).toBe(1);
    expect(check.outsideRecords).toEqual([expect.objectContaining({ dealerName: "Kia Ikeja", mileage: 6_500, canRemove: true, photo: expect.objectContaining({ jobCardId: job.id }) })]);
    const missedAfter = check.history?.verdict.kind === "IRREGULAR" ? check.history.verdict.missedCount : 0;
    expect(missedAfter).toBe(missedBefore - 1);
    expect(check.history?.services.find((row) => row.source === "OUTSIDE")).toMatchObject({ label: "Kia Ikeja", kmSinceLast: 2_500 });

    // Only its creator or an admin removes it, with a reason; it stays stored (soft delete).
    const recordId = check.outsideRecords[0].id;
    await expect(warranty.removeOutsideRecord(job.id, recordId, { reason: "Wrong car" }, users.otherOfficer, officerAccess)).rejects.toMatchObject({ statusCode: 403 });
    await expect(warranty.removeOutsideRecord(job.id, recordId, {}, users.officer, officerAccess)).rejects.toMatchObject({ name: "ZodError" });
    check = await warranty.removeOutsideRecord(job.id, recordId, { reason: "Stamp belongs to another vehicle" }, users.officer, officerAccess);
    expect(check.outsideRecords).toEqual([]);
    expect(await db.externalServiceRecord.findUniqueOrThrow({ where: { id: recordId } })).toMatchObject({ removedById: users.officer.id, removedReason: "Stamp belongs to another vehicle" });
    expect(await db.auditLog.count({ where: { userId: users.officer.id, action: { in: ["EXTERNAL_SERVICE_RECORD_ADDED", "EXTERNAL_SERVICE_RECORD_REMOVED", "JOB_WARRANTY_DECISIONS_SAVED"] } } })).toBe(4);

    // The job opened in warranty, so the case was opened automatically; drop it to check the handoff opens one.
    await db.warrantyCase.deleteMany({ where: { jobCardId: job.id } });
    const workspace = await stages.act(job.id, { action: "WARRANTY_TO_ADVISOR", requestId: randomUUID() }, users.officer);
    expect(workspace.stage).toBe("ESTIMATE");
    const opened = await db.warrantyCase.findUniqueOrThrow({ where: { jobCardId: job.id }, include: { statusHistory: true } });
    expect(opened).toMatchObject({ status: "OPEN", openedAutomatically: false, createdById: users.officer.id, complaint: "Compressor clutch not engaging.", mileage: 12_000 });
    expect(opened.statusHistory).toHaveLength(1);
    const event = await db.jobStageEvent.findFirstOrThrow({ where: { jobCardId: job.id, action: "WARRANTY_TO_ADVISOR" } });
    expect(event.note).toBe(`2 items warranty, 1 item customer pay. Warranty case ${opened.caseNumber}.`);
    expect(await db.auditLog.count({ where: { userId: users.officer.id, action: "JOB_WARRANTY_DECIDED" } })).toBe(1);

    // Decisions are locked once the job has moved on.
    await expect(
      warranty.saveDecisions(job.id, { items: [{ itemId: job.items.wiper, payer: "GOODWILL" }] }, users.officer, officerAccess),
    ).rejects.toMatchObject({ statusCode: 409, code: "WARRANTY_LOCKED" });
  });

  it("keeps the existing warranty case and needs no reason for a regular history", async () => {
    const vehicle = await db.vehicle.create({
      data: { vin: `WTR${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage", vehicleModelId, saleDate: new Date(Date.now() - 60 * DAY) },
    });
    const job = await open(vehicle.id, 3_000, "AC not cooling well");
    const autoCase = await db.warrantyCase.findUniqueOrThrow({ where: { jobCardId: job.id } });
    await db.jobCard.update({ where: { id: job.id }, data: { stage: "WARRANTY", stageOwnerId: null, stageOwnerRole: "WarrantyOfficer" } });
    const finding = await db.jobFinding.create({ data: { jobCardId: job.id, causeAndDefect: "Compressor seized.", createdById: users.technician.id } });
    const item = await db.jobFindingItem.create({ data: { findingId: finding.id, kind: "PART", referenceId: compressorId, description: "AC compressor", quantity: 1, sortOrder: 0 } });

    const check = await warranty.get(job.id, users.officer, officerAccess);
    expect(check.history?.verdict).toEqual({ kind: "REGULAR" });
    await warranty.saveDecisions(job.id, { items: [{ itemId: item.id, payer: "WARRANTY" }] }, users.officer, officerAccess);
    await stages.act(job.id, { action: "WARRANTY_TO_ADVISOR", requestId: randomUUID() }, users.officer);
    expect(await db.warrantyCase.findMany({ where: { jobCardId: job.id }, select: { id: true } })).toEqual([{ id: autoCase.id }]);
  });

  it("explains missing data: a vehicle without a sale date", async () => {
    const vehicle = await db.vehicle.create({
      data: { vin: `WTN${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage" },
    });
    const job = await open(vehicle.id, 15_000, "AC not cooling well");
    const check = await warranty.get(job.id, users.officer, officerAccess);
    expect(check.history?.verdict).toEqual({ kind: "INSUFFICIENT_DATA", missing: ["NO_SALE_DATE"] });
    expect(check.history?.insufficient).toEqual([
      {
        reason: "NO_SALE_DATE",
        text: "No sale date is recorded for this vehicle",
        fix: "Add the sale date on the vehicle's warranty details (Warranty, Vehicle warranty).",
      },
    ]);
  });
});
