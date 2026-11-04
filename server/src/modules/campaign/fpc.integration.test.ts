/**
 * FPC bulletins end to end against a real PostgreSQL database: VIN ranges, linking a vehicle
 * registered later, the READY attendance guard, campaign vehicle statuses, and the FPC
 * vehicles (F1) and FPC analysis (F2) reports. Skipped unless TEST_DATABASE_URL is set.
 * Never point TEST_DATABASE_URL at a shared database: the test creates its own branch,
 * users, customer, vehicles and campaign with unique names.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest fpc.integration
 */
import type { PrismaClient } from "@prisma/client";
import { estimateContentHash } from "../service/estimate-signature";
import type { ServiceService as ServiceServiceType } from "../service/service.service";
import type { CampaignService as CampaignServiceType } from "./campaign.service";
import type { JobCardWorkflowService as WorkflowType } from "../service/job-card-workflow.service";
import type { ReportDefinition, ReportResponse } from "../reports/core/types";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(90_000);

describeDb("FPC bulletins (database)", () => {
  let prisma: PrismaClient;
  let service: ServiceServiceType;
  let campaigns: CampaignServiceType;
  let workflow: WorkflowType;
  let workshop: { updateQC(id: string, qcStatus: string, qcNotes?: string): Promise<unknown> };
  let reports: ReportDefinition[];
  let executeReport: (db: unknown, definition: ReportDefinition, user: unknown, query: Record<string, unknown>) => Promise<ReportResponse>;

  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-6);
  // One 11-character prefix for the run, then a 6-digit serial (no I/O/Q).
  const prefix = `KNAKU8${run.slice(0, 5)}`;
  const vin = (serial: number) => `${prefix}${String(serial).padStart(6, "0")}`;
  let branch: { id: string; name: string };
  let adviser: { id: string };
  let officer: { id: string };
  let customer: { id: string };
  let bay: { id: string };
  let team: { id: string };
  let serviceType: { id: string };
  let sorento: { id: string };
  let catalogService: { id: string };

  const vehicle = (serial: number) =>
    prisma.vehicle.create({
      data: { customerId: customer.id, vin: vin(serial), make: "Kia", model: "Sorento", customMake: "Kia", customModel: "Sorento", catalogueId: sorento.id },
    });

  const openJob = (vehicleId: string, campaignId: string) =>
    service.createJobCard({
      vehicleId,
      customerId: customer.id,
      serviceId: catalogService.id,
      serviceTypeId: serviceType.id,
      branchName: branch.name,
      description: "Periodic service",
      bayId: bay.id,
      teamId: team.id,
      serviceAdvisorId: adviser.id,
      promisedAt: new Date(Date.now() + 86_400_000).toISOString(),
      complaints: [{ description: "Periodic service" }],
      createdById: adviser.id,
      mileage: 20_000,
      warrantyAcknowledged: true,
      acknowledgedCampaignIds: [campaignId],
    });

  /** Approved estimate, then OPEN → IN_PROGRESS → QC (passed); READY is left to the test. */
  const toQc = async (jobCardId: string) => {
    const estimate = await service.addEstimate(jobCardId, { description: "Approved scope", lines: [{ type: "SERVICE", referenceId: serviceType.id, quantity: 1 }] });
    const signed = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { lines: true } });
    await service.addApproval(
      estimate.id,
      { customerId: customer.id, approved: true, expectedVersion: signed.version, expectedHash: estimateContentHash(signed), overrideReason: "Paper approval on file" },
      adviser.id,
      { deviceOrIp: "test", allowOverride: true },
    );
    await service.updateJobCard(jobCardId, { status: "IN_PROGRESS" }, adviser.id);
    await service.updateJobCard(jobCardId, { status: "QC" }, adviser.id);
    await workshop.updateQC(jobCardId, "PASSED", "Checked");
  };

  const report = (slug: string, query: Record<string, unknown>) => {
    const definition = reports.find((r) => r.slug === slug)!;
    const user = { userId: officer.id, email: "o@test.local", role: "Admin", permissions: [], branchId: branch.id };
    return prisma.$transaction((tx) => executeReport(tx, definition, user, definition.query.parse({ branchId: branch.id, ...query }) as Record<string, unknown>));
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require("../../prisma/client").default;
    service = new (require("../service/service.service").ServiceService)();
    campaigns = new (require("./campaign.service").CampaignService)();
    workflow = new (require("../service/job-card-workflow.service").JobCardWorkflowService)();
    workshop = new (require("../workshop/workshop.service").WorkshopService)();
    reports = require("../reports/reports.registry").REPORTS;
    executeReport = require("../reports/reports.controller").executeReport;

    const role = (name: string) => prisma.role.upsert({ where: { name }, update: {}, create: { name } });
    const [adviserRole, officerRole] = await Promise.all([role("ServiceAdviser"), role("WarrantyOfficer")]);
    branch = await prisma.branch.create({ data: { name: `FPC Branch ${run}`, phoneNumber: "0800 000 0000" } });
    const user = (label: string, roleId: string) =>
      prisma.user.create({ data: { email: `fpc.${label}.${run}@test.local`, passwordHash: "x", firstName: label, lastName: "Test", roleId, branchId: branch.id } });
    adviser = await user("adviser", adviserRole.id);
    officer = await user("officer", officerRole.id);
    customer = await prisma.customer.create({
      data: { firstName: "Amaka", lastName: `Eze${run}`, email: `fpc.customer.${run}@test.local`, branchId: branch.id, address: "12 Allen Avenue", city: "Ikeja" },
    });
    const master = (kind: string, description = kind) => prisma.workshopMaster.create({ data: { kind, code: `FPC-${kind}-${run}`, description } });
    [bay, team, serviceType] = await Promise.all([master("BAY"), master("TEAM"), master("SERVICE_TYPE")]);
    sorento = await master("MODEL", `Sorento ${run}`);
    await prisma.serviceTypeModelSetting.create({ data: { serviceTypeId: serviceType.id, modelId: sorento.id, serviceCharge: 0 } });
    catalogService = await prisma.service.create({ data: { name: `FPC test service ${run}`, price: 0 } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("runs an FPC bulletin from VIN ranges to the reports", async () => {
    const [first, second] = [await vehicle(101), await vehicle(102)];

    // ── Bulletin with a range of three VINs: two in the system, one registered later ──
    const created = await campaigns.create(
      {
        code: `KC13 FPC-${run}`,
        title: "Sorento (XM) fuel pump plate cover replacement",
        type: "FPC",
        description: "Countermeasure for all customers visiting the workshop",
        bulletinDate: new Date("2026-10-01T00:00:00Z"),
        jobCardText: `${run}-SORENTO (XM)`,
        startDate: new Date(Date.now() - 86_400_000),
      },
      officer.id,
    );
    expect(created).toMatchObject({ code: `KC13 FPC-${run}`, type: "FPC", printOnJobCard: true });

    await expect(campaigns.addVinRanges(created.id, { ranges: [{ vinFrom: vin(103), vinTo: vin(101) }] }, officer.id)).rejects.toThrow(/must not come after/);
    const preview = await campaigns.addVinRanges(created.id, { ranges: [{ vinFrom: vin(101), vinTo: vin(103) }], dryRun: true }, officer.id);
    expect(preview).toMatchObject({ newRanges: 1, vehiclesInRanges: 2, toAdd: 2, added: 0, saved: 0 });
    const saved = await campaigns.addVinRanges(created.id, { ranges: [{ vinFrom: vin(101), vinTo: vin(103) }] }, officer.id);
    expect(saved).toMatchObject({ saved: 1, added: 2 });

    await campaigns.activate(created.id);
    const { VehicleService } = require("../vehicle/vehicle.service");
    const later = await new VehicleService().createVehicle({ customerId: customer.id, vin: vin(103).toLowerCase(), customMake: "Kia", customModel: "Sorento" });
    const outside = await new VehicleService().createVehicle({ customerId: customer.id, vin: vin(104), customMake: "Kia", customModel: "Sorento" });
    const rows = await prisma.campaignVehicle.findMany({ where: { campaignId: created.id }, orderBy: { vin: "asc" } });
    expect(rows.map((r) => [r.vin, r.vehicleId])).toEqual([
      [vin(101), first.id],
      [vin(102), second.id],
      [vin(103), later.id],
    ]);
    expect(rows.some((r) => r.vehicleId === outside.id)).toBe(false);

    // ── One vehicle called by letter (record as called) ──
    const firstRow = rows[0];
    expect(await campaigns.recordPrintedContacts({ campaignVehicleIds: [firstRow.id], channel: "LETTER" }, officer.id)).toEqual({ recorded: 1, skipped: 0 });
    expect(await prisma.campaignVehicle.findUniqueOrThrow({ where: { id: firstRow.id } })).toMatchObject({ status: "PENDING", contactAttempts: 1, lastContactOutcome: "SENT" });

    const calledList = await report("fpc-vehicles", { campaign: [created.id], show: "CALLED_NOT_VISITED" });
    expect(calledList.rows.map((r) => r.vin)).toEqual([vin(101)]);

    // ── Two job cards: the first vehicle attended, the second not attended ──
    const attendedJob = await openJob(first.id, created.id);
    const skippedJob = await openJob(second.id, created.id);
    expect(await prisma.campaignVehicle.count({ where: { campaignId: created.id, status: "SCHEDULED" } })).toBe(2);

    await toQc(attendedJob.id);
    await expect(service.updateJobCard(attendedJob.id, { status: "READY" }, adviser.id)).rejects.toMatchObject({
      statusCode: 409,
      code: "CAMPAIGN_ATTENDANCE_REQUIRED",
      details: [expect.objectContaining({ campaignId: created.id })],
    });
    await workflow.setCampaignAttendance(attendedJob.id, created.id, { attended: true }, adviser.id);
    await service.updateJobCard(attendedJob.id, { status: "READY" }, adviser.id);

    await toQc(skippedJob.id);
    await expect(workflow.setCampaignAttendance(skippedJob.id, created.id, { attended: false }, adviser.id)).rejects.toThrow(/reason/);
    await workflow.setCampaignAttendance(skippedJob.id, created.id, { attended: false, reason: "PARTS_NOT_AVAILABLE", note: "Back order" }, adviser.id);
    await service.updateJobCard(skippedJob.id, { status: "READY" }, adviser.id);

    const statuses = Object.fromEntries(
      (await prisma.campaignVehicle.findMany({ where: { campaignId: created.id } })).map((r) => [r.vin, [r.status, r.completedJobCardId]]),
    );
    expect(statuses).toEqual({
      [vin(101)]: ["COMPLETED", attendedJob.id],
      // Not attended and never reached by phone: back to pending, flagged on the next job card.
      [vin(102)]: ["PENDING", null],
      [vin(103)]: ["PENDING", null],
    });

    // The job card shows the answer and the text to print.
    const card = await service.getJobCard(skippedJob.id);
    expect(card.campaigns[0]).toMatchObject({ attended: false, notAttendedReason: "Parts not available: Back order", campaign: { jobCardText: `${run}-SORENTO (XM)`, printOnJobCard: true } });

    // ── F1: the five lists ──
    const list = async (show: string) => (await report("fpc-vehicles", { campaign: [created.id], show, order: "VIN" })).rows.map((r) => [r.vin, r.jobNumber ?? null]);
    expect(await list("TO_BE_CALLED")).toEqual([[vin(102), null], [vin(103), null]]);
    expect(await list("CALLED_NOT_VISITED")).toEqual([]);
    expect(await list("VISITED_NOT_ATTENDED")).toEqual([[vin(102), skippedJob.jobNumber]]);
    expect(await list("ATTENDED")).toEqual([[vin(101), attendedJob.jobNumber]]);
    // The letter went out before the job card was opened, so it is not "attended but not called".
    expect(await list("ATTENDED_NOT_CALLED")).toEqual([]);
    const toCall = await report("fpc-vehicles", { campaign: [created.id] });
    expect(toCall.summary).toEqual({ TO_BE_CALLED: 2, CALLED_NOT_VISITED: 0, VISITED_NOT_ATTENDED: 1, ATTENDED: 1, ATTENDED_NOT_CALLED: 0 });

    // ── F2: billed in the period counts as visited; visited = attended + not attended ──
    const today = new Date().toISOString().slice(0, 10);
    await prisma.jobCard.updateMany({ where: { id: { in: [attendedJob.id, skippedJob.id] } }, data: { billedAt: new Date() } });
    const analysis = await report("fpc-analysis", { from: today, to: today, campaignType: "FPC", order: "BULLETIN_DATE", bulletinFrom: "2026-10-01", bulletinTo: "2026-10-01" });
    const row = analysis.rows.find((r) => r.campaignId === created.id);
    expect(row).toMatchObject({
      affected: 3,
      called: 1,
      visited: 2,
      attended: 1,
      notAttended: 1,
      reasons: "Parts not available 1",
      attendedPctVisited: 50,
      attendedPctAffected: 33.3,
      outstanding: 2,
    });
  });
});
