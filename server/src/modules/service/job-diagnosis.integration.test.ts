import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobDiagnosisService } from "./job-diagnosis.service";
import type { JobStageService } from "./job-stage.service";
import type { WorkshopService } from "../workshop/workshop.service";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(90000);

// A 1 x 1 PNG: the smallest photo the server accepts.
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";

describeDb("Diagnosis on isolated local PostgreSQL (job card revamp phase 3)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let diagnosis: JobDiagnosisService;
  let stages: JobStageService;
  let workshop: WorkshopService;
  const run = `${Date.now()}`;
  let branchName: string;
  let branchId: string;
  let serviceTypeId: string;
  let variantId: string;
  let customerId: string;
  let bayId: string;
  let otherBayId: string;
  let labourId: string;
  let partId: string;
  let oilId: string;
  type Key = "advisor" | "supervisor" | "technician" | "otherTechnician" | "engineer";
  const users: Record<Key, { id: string; role: string }> = {} as never;

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Diagnosis tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    diagnosis = new (require("./job-diagnosis.service").JobDiagnosisService)();
    stages = new (require("./job-stage.service").JobStageService)();
    workshop = new (require("../workshop/workshop.service").WorkshopService)();
    branchName = `Diagnosis fixture ${run}`;
    branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const teamId = (await db.workshopMaster.create({ data: { kind: "TEAM", code: `DX-T-${run}`, description: "Brakes and AC" } })).id;
    const person = async (key: Key, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `diag-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("supervisor", "WorkshopManager");
    await person("technician", "Technician");
    await person("otherTechnician", "Technician");
    await person("engineer", "Engineer");
    await db.employee.create({
      data: { code: `DX-E-${run}`, name: "technician Synthetic", branchId, teamId, userId: users.technician.id },
    });
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    const modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `DX-M-${run}`, description: "Synthetic Sportage" } })).id;
    variantId = (await db.workshopMaster.create({ data: { kind: "VARIANT", code: `DX-V-${run}`, description: "Sportage 2.0", parentId: modelId } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `DX-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 0 } });
    bayId = (await db.workshopMaster.create({ data: { kind: "BAY", code: `DX-A2-${run}`, description: "Bay A2" } })).id;
    otherBayId = (await db.workshopMaster.create({ data: { kind: "BAY", code: `DX-A3-${run}`, description: "Bay A3" } })).id;
    labourId = (await db.labourItem.create({ data: { code: `DX-L-${run}`, description: "Replace front brake pads", rate: 15000 } })).id;
    await db.labourRate.create({ data: { labourItemId: labourId, modelId, rate: 15000 } });
    // A labour item without a rate for this model is not offered.
    await db.labourItem.create({ data: { code: `DX-L2-${run}`, description: "Replace front brake discs (other model)", rate: 9000 } });
    partId = (await db.sparePart.create({ data: { partNumber: `DX-P-${run}`, name: "Front brake pads set", taxCategory: "A" } })).id;
    oilId = (await db.sparePart.create({ data: { partNumber: `DX-O-${run}`, name: "Engine oil 5W-30", uom: "LTR", taxCategory: "B" } })).id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** A job that finished check-in: at Diagnosis with the workshop supervisor, no technician yet. */
  async function jobAtDiagnosis(complaints: string[]) {
    const vehicleId = (await db.vehicle.create({ data: { vin: `DIAG${run}${randomUUID().slice(0, 8)}`, customerId, catalogueId: variantId, customModel: "Synthetic Sportage" } })).id;
    const job = await workflow.open({
      branchName,
      customerId,
      vehicleId,
      serviceTypeId,
      serviceAdvisorId: users.advisor.id,
      description: complaints[0],
      mileage: 48_250,
      promisedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      complaints: complaints.map((description) => ({ description })),
      createdById: users.advisor.id,
    });
    await db.jobCard.update({ where: { id: job.id }, data: { stage: "DIAGNOSIS", stageOwnerId: null, stageOwnerRole: "WorkshopManager" } });
    const requests = await db.jobComplaint.findMany({ where: { jobCardId: job.id }, orderBy: { id: "asc" }, select: { id: true } });
    return { id: job.id, jobNumber: job.jobNumber, requests: requests.map((row) => row.id) };
  }

  const assign = (id: string, extra: { bayId?: string; note?: string; requestId?: string; actor?: { id: string; role: string } } = {}) =>
    workshop.assignTechnician(id, users.technician.id, undefined, (extra.actor ?? users.supervisor).id, {
      bayId: extra.bayId,
      note: extra.note,
      requestId: extra.requestId,
      actorRole: (extra.actor ?? users.supervisor).role,
    });

  const finding = (complaintId: string | null, text: string, extra: Record<string, unknown> = {}) => ({
    complaintId,
    causeAndDefect: text,
    possibleWarranty: false,
    items: [],
    expectedVersion: 0,
    ...extra,
  });

  it("assign, findings, return, findings, confirm: routed to the warranty officer by a flagged finding", async () => {
    const job = await jobAtDiagnosis(["Noise from front left wheel when braking", "AC not cooling well"]);

    // Allocation: the bay is required, only the supervisor assigns, and a retried request assigns once.
    await expect(assign(job.id)).rejects.toMatchObject({ statusCode: 400, details: { field: "bayId" } });
    await expect(assign(job.id, { bayId, actor: users.advisor })).rejects.toMatchObject({ statusCode: 403, code: "ALLOCATION_LOCKED" });
    const requestId = randomUUID();
    await assign(job.id, { bayId, note: "Customer waiting in the lounge", requestId });
    await assign(job.id, { bayId, note: "Customer waiting in the lounge", requestId });
    expect(await db.jobStageEvent.count({ where: { jobCardId: job.id, requestId } })).toBe(1);
    const assigned = await db.jobCard.findUniqueOrThrow({ where: { id: job.id }, include: { diagnosis: true } });
    expect(assigned).toMatchObject({ technicianId: users.technician.id, bayId, stageOwnerId: users.technician.id, stageOwnerRole: "Technician" });
    expect(assigned.teamId).not.toBeNull();
    expect(assigned.diagnosis?.allocationNote).toBe("Customer waiting in the lounge");

    // The allocation list counts this job in the technician's hand, and the bay as occupied for other jobs.
    const list = await workshop.listTechnicians({ branchId, activeOnly: true, limit: 50 });
    expect(list.technicians.find((row) => row.id === users.technician.id)).toMatchObject({ jobsInHand: 1, availability: "AVAILABLE" });
    const other = await jobAtDiagnosis(["Engine warning light on"]);
    const bays = await diagnosis.bays(other.id);
    expect(bays.bays.find((bay) => bay.id === bayId)?.occupiedBy).toBe(job.jobNumber);
    expect(bays.bays.find((bay) => bay.id === otherBayId)?.occupiedBy).toBeNull();

    // Work options: the model's labour only, no prices; parts know whether they are oil.
    const labour = await diagnosis.labourOptions(job.id, "brake");
    expect(labour).toMatchObject({ scope: "MODEL", model: "Synthetic Sportage" });
    expect(labour.options.map((row) => row.description)).toEqual(["Replace front brake pads"]);
    expect(JSON.stringify(labour)).not.toMatch(/rate|15000/);
    const parts = await diagnosis.partOptions(`DX-O-${run}`);
    expect(parts.options).toEqual([expect.objectContaining({ id: oilId, kind: "OIL" })]);

    // Findings: another technician is refused; the assigned technician saves; stale saves are refused.
    const first = randomUUID();
    await expect(diagnosis.saveFinding(job.id, first, finding(job.requests[0], "Pads worn"), users.otherTechnician)).rejects.toMatchObject({
      statusCode: 403,
      code: "DIAGNOSIS_LOCKED",
      message: "Only the technician assigned to this job can record its findings.",
    });
    const saved = await diagnosis.saveFinding(
      job.id,
      first,
      finding(job.requests[0], "  Front pads worn to 2 mm, disc surface fine.  ", {
        items: [
          { kind: "LABOUR", referenceId: labourId, quantity: 3 },
          { kind: "PART", referenceId: partId, quantity: 1 },
          { kind: "PART", referenceId: oilId, quantity: 4.5 },
        ],
      }),
      users.technician,
    );
    expect(saved).toMatchObject({ version: 1, causeAndDefect: "Front pads worn to 2 mm, disc surface fine." });
    expect(saved.items.map((item) => [item.kind, item.quantity])).toEqual([["LABOUR", 1], ["PART", 1], ["OIL", 4.5]]);
    await expect(diagnosis.saveFinding(job.id, first, finding(job.requests[0], "Older text"), users.technician)).rejects.toMatchObject({
      statusCode: 409,
      code: "FINDING_VERSION",
    });
    await expect(diagnosis.saveFinding(job.id, randomUUID(), finding(job.requests[0], "Second card"), users.technician)).rejects.toMatchObject({
      code: "FINDING_VERSION",
    });

    // Photos on the finding, idempotent by request ID.
    const photoRequest = randomUUID();
    const photo = await diagnosis.addFindingPhoto(job.id, first, { requestId: photoRequest, image: PHOTO }, users.technician);
    expect(await diagnosis.addFindingPhoto(job.id, first, { requestId: photoRequest, image: PHOTO }, users.technician)).toMatchObject({ id: photo.id });
    expect(await db.jobPhoto.count({ where: { findingId: first, category: "FINDING" } })).toBe(1);

    // The gate: request 2 still has no finding; an empty extra finding needs words or removal.
    const extra = randomUUID();
    await diagnosis.saveFinding(job.id, extra, finding(null, ""), users.technician);
    await expect(stages.act(job.id, { action: "SEND_TO_ENGINEER", requestId: randomUUID() }, users.technician)).rejects.toMatchObject({
      statusCode: 409,
      details: {
        reasons: [
          "Write what you found for every customer request (1 of 2 still empty).",
          "Describe each finding the customer did not mention, or remove it.",
        ],
      },
    });
    await diagnosis.removeFinding(job.id, extra, users.technician);
    await expect(diagnosis.removeFinding(job.id, first, users.technician)).rejects.toMatchObject({ code: "FINDING_REQUIRED" });
    await diagnosis.saveFinding(job.id, randomUUID(), finding(job.requests[1], "Compressor clutch not engaging", { possibleWarranty: true }), users.technician);

    // Sent to the engineer: the engineer holds the job and the technician can no longer change it.
    let workspace = await stages.act(job.id, { action: "SEND_TO_ENGINEER", requestId: randomUUID() }, users.technician);
    expect(workspace).toMatchObject({ stage: "DIAGNOSIS", subStep: "ENGINEER_REVIEW", owner: { role: "Engineer" }, readOnly: true });
    await expect(diagnosis.saveFinding(job.id, first, finding(job.requests[0], "Late change", { expectedVersion: 1 }), users.technician)).rejects.toMatchObject({
      statusCode: 409,
      code: "DIAGNOSIS_LOCKED",
    });
    await expect(assign(job.id, { bayId: otherBayId })).rejects.toMatchObject({ statusCode: 409, code: "ALLOCATION_LOCKED" });
    expect(await db.jobcardNotificationEvent.count({ where: { jobCardId: job.id, after: { path: ["stageOwnerRole"], equals: "Engineer" } } })).toBe(1);

    // The engineer returns it: a note is required and reaches the technician.
    const engineerView = await stages.workspace(job.id, users.engineer);
    expect(engineerView.actions.map((view) => [view.action, view.kind])).toEqual([
      ["SEND_TO_WARRANTY", "primary"],
      ["RETURN_TO_TECHNICIAN", "secondary"],
    ]);
    await expect(stages.act(job.id, { action: "RETURN_TO_TECHNICIAN", requestId: randomUUID() }, users.engineer)).rejects.toMatchObject({
      statusCode: 400,
      message: "Write a note for the technician saying what to check again.",
    });
    workspace = await stages.act(job.id, { action: "RETURN_TO_TECHNICIAN", note: "Check the AC refrigerant pressure too.", requestId: randomUUID() }, users.engineer);
    expect(workspace).toMatchObject({ subStep: "FINDINGS", owner: { id: users.technician.id, role: "Technician" } });
    const back = await diagnosis.get(job.id, users.technician, { canUpdate: true });
    expect(back).toMatchObject({ editable: true, returned: { note: "Check the AC refrigerant pressure too.", by: "engineer Synthetic" } });
    const returnEvent = await db.jobcardNotificationEvent.findFirst({ where: { jobCardId: job.id, after: { path: ["returnNote"], equals: "Check the AC refrigerant pressure too." } } });
    expect(returnEvent).not.toBeNull();

    // The technician sends it again; the engineer confirms and the flagged finding routes it to warranty.
    await diagnosis.saveFinding(job.id, first, finding(job.requests[0], "Front pads worn to 2 mm. Refrigerant pressure normal.", { expectedVersion: 1 }), users.technician);
    await stages.act(job.id, { action: "SEND_TO_ENGINEER", requestId: randomUUID() }, users.technician);
    workspace = await stages.act(job.id, { action: "SEND_TO_WARRANTY", requestId: randomUUID() }, users.engineer);
    expect(workspace).toMatchObject({ stage: "WARRANTY", status: "OPEN", owner: { role: "WarrantyOfficer" } });
    const done = await db.jobCard.findUniqueOrThrow({ where: { id: job.id }, include: { diagnosis: true } });
    expect(done).toMatchObject({ status: "OPEN", engineerId: users.engineer.id, diagnosis: { route: "WARRANTY", confirmedById: users.engineer.id } });
    expect(await db.auditLog.count({ where: { action: "JOB_DIAGNOSIS_CONFIRMED", details: { contains: job.id } } })).toBe(1);
    // Diagnosis is locked once the job has moved on.
    await expect(diagnosis.saveFinding(job.id, first, finding(job.requests[0], "x", { expectedVersion: 2 }), users.engineer)).rejects.toMatchObject({
      code: "DIAGNOSIS_LOCKED",
      message: "Diagnosis is finished. This job is now at Warranty check.",
    });
  });

  it("nothing warranty related: confirmed to the service advisor and the warranty step is skipped", async () => {
    const job = await jobAtDiagnosis(["Periodic service (100,000 km)"]);
    await assign(job.id, { bayId: otherBayId });
    await diagnosis.saveFinding(job.id, randomUUID(), finding(job.requests[0], "Due for the scheduled service. No faults found."), users.technician);
    await stages.act(job.id, { action: "SEND_TO_ENGINEER", requestId: randomUUID() }, users.technician);
    const view = await diagnosis.get(job.id, users.engineer, { canUpdate: true });
    expect(view.routing).toEqual({ coverageActive: false, openCampaigns: 0, warrantyCase: false, flaggedFindings: 0, route: "ESTIMATE" });
    // A supervisor cannot confirm in the engineer's place.
    await expect(stages.act(job.id, { action: "SEND_TO_ADVISOR", requestId: randomUUID() }, users.supervisor)).rejects.toMatchObject({ statusCode: 403 });
    const workspace = await stages.act(job.id, { action: "SEND_TO_ADVISOR", requestId: randomUUID() }, users.engineer);
    expect(workspace).toMatchObject({ stage: "ESTIMATE", owner: { id: users.advisor.id } });
    expect(workspace.summaries.find((row) => row.stage === "WARRANTY")).toMatchObject({ state: "SKIPPED", reason: "Not under warranty" });
  });

  it("someone else's job: read-only for another technician and the advisor", async () => {
    const job = await jobAtDiagnosis(["Steering wheel vibrates above 100 km/h"]);
    await assign(job.id, { bayId });
    for (const actor of [users.otherTechnician, users.advisor, users.engineer]) {
      const view = await diagnosis.get(job.id, actor, { canUpdate: true });
      expect(view).toMatchObject({ editable: false, canAllocate: false });
      expect((await stages.workspace(job.id, actor)).readOnly).toBe(true);
    }
    expect((await diagnosis.get(job.id, users.technician, { canUpdate: true })).editable).toBe(true);
    expect((await diagnosis.get(job.id, users.technician, { canUpdate: false })).editable).toBe(false);
  });
});
