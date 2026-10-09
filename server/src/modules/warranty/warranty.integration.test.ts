/**
 * End-to-end tests for warranty coverage, warranty cases, job card charge types and
 * campaigns against a real PostgreSQL database. Skipped unless TEST_DATABASE_URL is
 * set. Never point TEST_DATABASE_URL at a shared database: the tests create their own
 * branch, users, customers, vehicles, parts and campaigns with unique names.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest warranty.integration
 */
import type { PrismaClient } from "@prisma/client";
import type { ServiceService as ServiceServiceType } from "../service/service.service";
import type { WarrantyCaseService as CaseServiceType } from "./warrantyCase.service";
import type { CampaignService as CampaignServiceType } from "../campaign/campaign.service";
import type { JobCardLineService as LineServiceType } from "../job-card-line/jobCardLine.service";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(90_000);

describeDb("Warranty, charge types and campaigns (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceServiceType;
  let cases: CaseServiceType;
  let campaigns: CampaignServiceType;
  let lines: LineServiceType;
  let labour: { addJobCardLine(jobCardId: string, input: { labourItemId: string; hours?: number }): Promise<{ id: string }> };
  let workshop: { updateQC(id: string, qcStatus: string, qcNotes?: string): Promise<unknown> };

  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // Unique 17-character VINs for this run (digits only in the serial, never I/O/Q).
  const vin = (n: number) => `KNAPU81BD${run.slice(-6)}${String(n).padStart(2, "0")}`.slice(0, 17);
  let branch: { id: string; name: string };
  let adviser: { id: string };
  let officer: { id: string };
  let customer: { id: string };
  let sportage: { id: string };
  let coilPart: { id: string; partNumber: string };
  let oilPart: { id: string; partNumber: string };
  let bay: { id: string };
  let team: { id: string };
  let catalogService: { id: string };
  let serviceType: { id: string };
  let workshopModel: { id: string };
  let harnessOp: { id: string; code: string };
  let serviceOp: { id: string; code: string };

  const vehicle = (n: number, data: { startDate?: Date | null; lastMileage?: number | null; model?: string | null } = {}) =>
    prisma.vehicle.create({
      data: {
        customerId: customer.id,
        vin: vin(n),
        make: "Kia",
        model: "Sportage",
        customMake: "Kia",
        customModel: "Sportage",
        catalogueId: workshopModel.id,
        vehicleModelId: data.model === null ? null : sportage.id,
        saleDate: data.startDate === undefined ? new Date(Date.now() - 400 * 86_400_000) : data.startDate,
        lastRecordedMileage: data.lastMileage === undefined ? 30_000 : data.lastMileage,
      },
    });

  const jobCard = (vehicleId: string, extra: Record<string, unknown> = {}) =>
    service.createJobCard({
      vehicleId,
      customerId: customer.id,
      serviceId: catalogService.id,
      serviceTypeId: serviceType.id,
      branchName: branch.name,
      description: "Engine warning light on, rough idle when cold",
      bayId: bay.id,
      teamId: team.id,
      serviceAdvisorId: adviser.id,
      promisedAt: new Date(Date.now() + 86_400_000).toISOString(),
      complaints: [{ description: "Engine warning light on" }],
      createdById: adviser.id,
      mileage: 35_000,
      ...extra,
    });

  /** The customer approves an estimate for the service plus this scope (the team's approval gate). */
  const approve = async (jobCardId: string, scope: { type: "PART" | "LABOUR"; referenceId: string; quantity: number }[]) => {
    const estimate = await service.addEstimate(jobCardId, {
      description: "Approved scope",
      lines: [{ type: "SERVICE", referenceId: serviceType.id, quantity: 1 }, ...scope],
    });
    await service.addApproval(estimate.id, { customerId: customer.id, approved: true });
  };

  /** OPEN → IN_PROGRESS → QC (passed) → READY. */
  const toReady = async (jobCardId: string) => {
    await service.updateJobCard(jobCardId, { status: "IN_PROGRESS" }, adviser.id);
    await service.updateJobCard(jobCardId, { status: "QC" }, adviser.id);
    await workshop.updateQC(jobCardId, "PASSED", "Checked");
    return service.updateJobCard(jobCardId, { status: "READY" }, adviser.id);
  };

  const issue = async (jobCardId: string, partId: string, quantity: number) =>
    prisma.partIssuance.create({ data: { branchId: branch.id, sparePartId: partId, jobCardId, issuedById: adviser.id, quantity } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("../service/service.service").ServiceService)();
    cases = new (require("./warrantyCase.service").WarrantyCaseService)();
    campaigns = new (require("../campaign/campaign.service").CampaignService)();
    lines = new (require("../job-card-line/jobCardLine.service").JobCardLineService)();
    labour = new (require("../service/labour.service").LabourService)();
    workshop = new (require("../workshop/workshop.service").WorkshopService)();

    const role = (name: string) => prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    const [adviserRole, officerRole] = await Promise.all([role("ServiceAdviser"), role("WarrantyOfficer")]);
    branch = await prisma.branch.create({ data: { name: `Warranty Branch ${run}` } });
    const user = (label: string, roleId: string) =>
      prisma.user.create({
        data: { email: `${label}.${run}@test.local`, passwordHash: "x", firstName: label, lastName: "Test", roleId, branchId: branch.id },
      });
    adviser = await user("adviser", adviserRole.id);
    officer = await user("officer", officerRole.id);
    customer = await prisma.customer.create({
      data: { firstName: "Chinedu", lastName: `Okafor${run}`, email: `customer.${run}@test.local`, branchId: branch.id },
    });
    sportage = await prisma.vehicleModel.create({
      data: { code: `SPG-${run}`, name: `Sportage ${run}`, warrantyDays: 1825, warrantyKm: 100_000 },
    });
    coilPart = await prisma.sparePart.create({
      data: { partNumber: `27301-2B010-${run}`, name: "Ignition coil assy", unitPrice: 40_000, retailRate: 64_300, warrantyApplicable: true, warrantyRate: 48_500 },
    });
    oilPart = await prisma.sparePart.create({
      data: { partNumber: `26300-35505-${run}`, name: "Engine oil and filter kit", unitPrice: 30_000, retailRate: 38_500 },
    });
    const master = (kind: string) => prisma.workshopMaster.create({ data: { kind, code: `${kind}-${run}`, description: kind } });
    [bay, team] = await Promise.all([master("BAY"), master("TEAM")]);
    [serviceType, workshopModel] = await Promise.all([master("SERVICE_TYPE"), master("MODEL")]);
    await prisma.serviceTypeModelSetting.create({ data: { serviceTypeId: serviceType.id, modelId: workshopModel.id, serviceCharge: 0 } });
    catalogService = await prisma.service.create({ data: { name: `Warranty test service ${run}`, price: 0 } });
    harnessOp = await prisma.labourItem.create({ data: { code: `HRN-${run}`, description: "Harness inspection", defaultHours: 1.2, rate: 15_000 } });
    serviceOp = await prisma.labourItem.create({ data: { code: `SRV-${run}`, description: "Periodic service 60k", defaultHours: 2, rate: 24_000 } });
    await prisma.warrantyDefectCode.upsert({ where: { code: `D07${run}` }, update: {}, create: { code: `D07${run}`, description: "Internal short" } });
    await prisma.warrantyRejectReason.upsert({ where: { code: `R02${run}` }, update: {}, create: { code: `R02${run}`, description: "Outside warranty period" } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("requires acknowledgement, snapshots coverage, opens a case and notifies warranty officers", async () => {
    const v = await vehicle(1);

    await expect(jobCard(v.id)).rejects.toMatchObject({ statusCode: 409, code: "WARRANTY_ACK_REQUIRED" });
    await expect(jobCard(v.id)).rejects.toHaveProperty("details.coverage.status", "ACTIVE");
    expect(await prisma.jobCard.count({ where: { vehicleId: v.id } })).toBe(0);

    const card = await jobCard(v.id, { warrantyAcknowledged: true });
    expect(card).toMatchObject({ mileage: 35_000, warrantyStatusAtCreation: "ACTIVE", warrantyKmLimitAtCreation: 100_000 });
    expect(card.warrantyAcknowledgedById).toBe(adviser.id);
    expect(card.warrantyCase?.caseNumber).toMatch(/^WTY\d{10}$/);

    const opened = await cases.get(card.warrantyCase!.id);
    expect(opened).toMatchObject({ status: "OPEN", openedAutomatically: true, mileage: 35_000, coverageStatus: "ACTIVE" });
    expect(opened.statusHistory).toHaveLength(1);

    const refreshed = await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } });
    expect(refreshed.lastRecordedMileage).toBe(35_000);

    const notes = await prisma.notification.findMany({ where: { userId: officer.id, type: "WARRANTY_JOB_CREATED" } });
    expect(notes.some((n) => n.message.includes(v.vin) && n.message.includes(card.jobNumber))).toBe(true);

    // The snapshot is history: changing the policy later does not rewrite it.
    await prisma.vehicleModel.update({ where: { id: sportage.id }, data: { warrantyKm: 10_000 } });
    const again = await prisma.jobCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(again.warrantyStatusAtCreation).toBe("ACTIVE");
    await prisma.vehicleModel.update({ where: { id: sportage.id }, data: { warrantyKm: 100_000 } });
  });

  it("rejects a lower odometer reading unless the odometer was replaced", async () => {
    const v = await vehicle(2, { lastMileage: 58_210 });
    await expect(jobCard(v.id, { mileage: 50_000, warrantyAcknowledged: true })).rejects.toThrow(/lower than the last recorded/);
    const card = await jobCard(v.id, { mileage: 120, warrantyAcknowledged: true, odometerReplaced: true, odometerReplacedReason: "Cluster replaced" });
    expect(card.mileage).toBe(120);
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: v.id } })).lastRecordedMileage).toBe(120);
  });

  it("treats missing data as UNKNOWN: no acknowledgement required and no case", async () => {
    const v = await vehicle(3, { startDate: null });
    const card = await jobCard(v.id);
    expect(card.warrantyStatusAtCreation).toBe("UNKNOWN");
    expect(card.warrantyReasonsAtCreation).toEqual(["NO_START_DATE"]);
    expect(card.warrantyCase).toBeNull();
    expect(await prisma.warrantyCase.count({ where: { jobCardId: card.id } })).toBe(0);
  });

  it("runs a recall: VINs, activation, check-in flag, scheduling on job card and completion", async () => {
    const v = await vehicle(4);
    const created = await campaigns.create(
      {
        code: `RC-${run}`,
        title: "Engine wiring harness inspection",
        type: "RECALL",
        startDate: new Date(Date.now() - 86_400_000),
        models: [{ vehicleModelId: sportage.id }],
        coveredItems: [{ kind: "LABOUR", operationCode: harnessOp.code, description: "Harness inspection" }],
      },
      officer.id,
    );
    const later = vin(40);
    const preview = await campaigns.addVehicles(created.id, { vins: [v.vin, v.vin.toLowerCase(), "KNAPU81BDP712", later], dryRun: true });
    expect(preview).toMatchObject({ valid: 2, toAdd: 2, notInSystem: 1, duplicatesInInput: 1, added: 0 });
    expect(preview.invalid[0]).toMatchObject({ line: 3, error: "must be 17 characters" });
    expect(await prisma.campaignVehicle.count({ where: { campaignId: created.id } })).toBe(0);

    const added = await campaigns.addVehicles(created.id, { vins: [v.vin, later] });
    expect(added.added).toBe(2);
    expect((await campaigns.addVehicles(created.id, { vins: [v.vin] })).alreadyInCampaign).toBe(1);

    await campaigns.activate(created.id);
    const activation = await prisma.notification.findMany({ where: { userId: adviser.id, type: "CAMPAIGN_ACTIVATED" } });
    expect(activation.some((n) => n.message.includes(`RC-${run}`))).toBe(true);

    // The open recall must be acknowledged too.
    await expect(jobCard(v.id, { warrantyAcknowledged: true })).rejects.toMatchObject({ code: "WARRANTY_ACK_REQUIRED" });
    const card = await jobCard(v.id, { warrantyAcknowledged: true, acknowledgedCampaignIds: [created.id] });
    const row = await prisma.campaignVehicle.findUniqueOrThrow({ where: { campaignId_vin: { campaignId: created.id, vin: v.vin } } });
    expect(row.status).toBe("SCHEDULED");
    expect(await prisma.jobCardCampaign.count({ where: { jobCardId: card.id, campaignId: created.id } })).toBe(1);

    // Labour (from the labour catalogue) covered by the campaign defaults to FREE, charged to the campaign.
    await approve(card.id, [{ type: "LABOUR", referenceId: harnessOp.id, quantity: 1.2 }]);
    const harness = await labour.addJobCardLine(card.id, { labourItemId: harnessOp.id, hours: 1.2 });
    const harnessLine = (await lines.list(card.id)).lines.find((l) => l.jobCardLabourId === harness.id);
    expect(harnessLine).toMatchObject({ kind: "LABOUR", chargeType: "FREE", campaignId: created.id, quantity: 1.2, amount: 18_000 });

    // The campaign work is complete when the job card reaches READY.
    expect((await prisma.campaignVehicle.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("SCHEDULED");
    const ready = await toReady(card.id);
    expect(ready.readyAt).not.toBeNull();
    const done = await prisma.campaignVehicle.findUniqueOrThrow({ where: { id: row.id } });
    expect(done).toMatchObject({ status: "COMPLETED", completedJobCardId: card.id });

    // A vehicle registered later links to its campaign row by VIN.
    const { VehicleService } = require("../vehicle/vehicle.service");
    const registered = await new VehicleService().createVehicle({ customerId: customer.id, vin: later.toLowerCase(), customMake: "Kia", customModel: "Sportage" });
    const linked = await prisma.campaignVehicle.findUniqueOrThrow({ where: { campaignId_vin: { campaignId: created.id, vin: later } } });
    expect(linked.vehicleId).toBe(registered.id);

    const progress = await campaigns.get(created.id);
    expect(progress.progress).toMatchObject({ affected: 2, completed: 1, outstanding: 1 });
    expect(progress.byBranch.find((b) => b.branchId === branch.id)).toMatchObject({ completed: 1 });
  });

  it("charges lines by payer, and the job bill charges only customer lines", async () => {
    const v = await vehicle(5);
    const card = await jobCard(v.id, { warrantyAcknowledged: true });
    await approve(card.id, [
      { type: "PART", referenceId: coilPart.id, quantity: 1 },
      { type: "PART", referenceId: oilPart.id, quantity: 1 },
      { type: "LABOUR", referenceId: serviceOp.id, quantity: 2 },
    ]);
    await issue(card.id, coilPart.id, 1);
    await issue(card.id, oilPart.id, 1);
    await labour.addJobCardLine(card.id, { labourItemId: serviceOp.id, hours: 2 });

    const listed = await lines.list(card.id);
    const coil = listed.lines.find((l) => l.sparePartId === coilPart.id)!;
    const oil = listed.lines.find((l) => l.sparePartId === oilPart.id)!;
    const service60k = listed.lines.find((l) => l.kind === "LABOUR")!;
    expect(coil).toMatchObject({ chargeType: "WARRANTY", rate: 48_500, amount: 48_500 });
    expect(oil).toMatchObject({ chargeType: "CUSTOMER", rate: 38_500 });
    expect(service60k).toMatchObject({ chargeType: "CUSTOMER", operationCode: serviceOp.code, quantity: 2, amount: 48_000 });
    expect(listed.totals).toMatchObject({ customer: 86_500, warranty: 48_500 });
    expect(listed.vatRate).toBe(0.075);

    // Syncing twice does not duplicate issuance or labour lines.
    expect((await lines.list(card.id)).lines).toHaveLength(3);

    // Only warranty-applicable parts can be charged to warranty; goodwill needs warranty:update.
    await expect(lines.updateLine(card.id, oil.id, { chargeType: "WARRANTY" }, { userId: adviser.id, canChargeGoodwill: false })).rejects.toThrow(/not warranty-applicable/);
    await expect(lines.updateLine(card.id, oil.id, { chargeType: "GOODWILL" }, { userId: adviser.id, canChargeGoodwill: false })).rejects.toThrow(/goodwill/);

    await toReady(card.id);
    const { JobBillingService } = require("../finance/job-billing.service");
    const bill = await new JobBillingService().createJobBill({
      jobCardId: card.id,
      partsDiscountPercent: 0,
      labourDiscountPercent: 0,
      serviceAdvisorId: adviser.id,
      actorId: adviser.id,
    });
    const billed = bill.lines.filter((l: { amount: number }) => l.amount > 0).map((l: { description: string }) => l.description).sort();
    expect(billed).toEqual(["Engine oil and filter kit", "Periodic service 60k"]);
    expect(bill.subtotal).toBe(86_500);

    // Once billed, who pays is fixed.
    const after = await lines.list(card.id);
    expect(after.lines.every((l) => l.locked)).toBe(true);
    expect(after.bill?.invoiceNumber).toBe(bill.invoiceNumber);
    await expect(lines.updateLine(card.id, oil.id, { chargeType: "GOODWILL" }, { userId: adviser.id, canChargeGoodwill: true })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("moves a claim through valid transitions only, once, with history", async () => {
    const v = await vehicle(6);
    const card = await jobCard(v.id, { warrantyAcknowledged: true });
    const caseId = card.warrantyCase!.id;
    const defect = await prisma.warrantyDefectCode.findUniqueOrThrow({ where: { code: `D07${run}` } });

    await expect(cases.addLine(caseId, { kind: "PART", role: "CAUSAL", sparePartId: oilPart.id, quantity: 1 })).rejects.toThrow(/not warranty-applicable/);
    await cases.addLine(caseId, { kind: "PART", role: "CAUSAL", sparePartId: coilPart.id, defectCodeId: defect.id, batchNo: "B2208", quantity: 1 });
    await expect(cases.addLine(caseId, { kind: "PART", role: "CAUSAL", sparePartId: coilPart.id, quantity: 1 })).rejects.toThrow(/already has a causal part/);
    const withLabour = await cases.addLine(caseId, { kind: "LABOUR", description: "Engine diagnosis", quantity: 1.5, rate: 15_000 });
    expect(withLabour.claimedAmount).toBe(71_000);

    await expect(cases.transition(caseId, "SUBMIT", {}, officer.id)).rejects.toThrow(/cannot be submitted/);
    await cases.transition(caseId, "START_REVIEW", {}, officer.id);
    await cases.transition(caseId, "SUBMIT", { manufacturerClaimNo: "KNG-WC-558213" }, officer.id);

    // Two officers record a decision at the same time: exactly one wins.
    const results = await Promise.allSettled([
      cases.transition(caseId, "APPROVE", {}, officer.id),
      cases.transition(caseId, "APPROVE", {}, officer.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const approved = await cases.get(caseId);
    expect(approved).toMatchObject({ status: "APPROVED", approvedAmount: 71_000, manufacturerClaimNo: "KNG-WC-558213" });
    await expect(cases.addLine(caseId, { kind: "LABOUR", description: "x", quantity: 1, rate: 1 })).rejects.toThrow(/cannot be changed/);

    await expect(cases.transition(caseId, "SETTLE", {}, officer.id)).rejects.toThrow(/settlement reference/);
    await cases.transition(caseId, "SETTLE", { settlementRef: "CN-2026-0091" }, officer.id);
    const settled = await cases.transition(caseId, "CLOSE", {}, officer.id);
    expect(settled.status).toBe("CLOSED");
    expect(settled.statusHistory.map((h) => h.toStatus)).toEqual(["CLOSED", "SETTLED", "APPROVED", "SUBMITTED", "IN_REVIEW", "OPEN"]);
    expect(settled.statusHistory.every((h) => h.actorId === officer.id || h.toStatus === "OPEN")).toBe(true);

    const statusNotes = await prisma.notification.findMany({ where: { userId: adviser.id, type: "WARRANTY_CASE_STATUS" } });
    expect(statusNotes.length).toBeGreaterThanOrEqual(5);
  });

  it("records a partial approval and requires a reason to reject", async () => {
    const v = await vehicle(7);
    const card = await jobCard(v.id, { warrantyAcknowledged: true });
    const caseId = card.warrantyCase!.id;
    const defect = await prisma.warrantyDefectCode.findUniqueOrThrow({ where: { code: `D07${run}` } });
    const reason = await prisma.warrantyRejectReason.findUniqueOrThrow({ where: { code: `R02${run}` } });
    let detail = await cases.addLine(caseId, { kind: "PART", role: "CAUSAL", sparePartId: coilPart.id, defectCodeId: defect.id, quantity: 1 });
    detail = await cases.addLine(caseId, { kind: "LABOUR", description: "Coil replacement", quantity: 1, rate: 15_800 });
    await cases.transition(caseId, "START_REVIEW", {}, officer.id);
    await cases.transition(caseId, "SUBMIT", {}, officer.id);

    await expect(cases.transition(caseId, "REJECT", {}, officer.id)).rejects.toThrow(/reject reason/);
    const labourLine = detail.lines.find((l) => l.kind === "LABOUR")!;
    const partial = await cases.transition(caseId, "PARTIALLY_APPROVE", { lineApprovals: [{ lineId: labourLine.id, approvalPercent: 60 }] }, officer.id);
    expect(partial.status).toBe("PARTIALLY_APPROVED");
    expect(partial.approvedAmount).toBe(48_500 + 9_480);

    const other = await jobCard((await vehicle(8)).id, { warrantyAcknowledged: true });
    const otherId = other.warrantyCase!.id;
    await cases.addLine(otherId, { kind: "PART", role: "CAUSAL", sparePartId: coilPart.id, defectCodeId: defect.id, quantity: 1 });
    await cases.transition(otherId, "START_REVIEW", {}, officer.id);
    await cases.transition(otherId, "SUBMIT", {}, officer.id);
    const rejected = await cases.transition(otherId, "REJECT", { rejectReasonId: reason.id, remarks: "Outside period" }, officer.id);
    expect(rejected).toMatchObject({ status: "REJECTED", approvedAmount: 0, rejectReasonId: reason.id });
  });
});
