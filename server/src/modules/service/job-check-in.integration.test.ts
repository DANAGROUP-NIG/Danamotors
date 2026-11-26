import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { JobCardWorkflowService } from "./job-card-workflow.service";
import type { JobCheckInService } from "./job-check-in.service";
import type { JobStageService } from "./job-stage.service";
import { CHECKLIST_ITEMS } from "./job-check-in.logic";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(90000);

const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
const allPresent = () => Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.code, "PRESENT"]));

describeDb("Check-in on isolated local PostgreSQL (job card revamp phase 2)", () => {
  let db: PrismaClient;
  let workflow: JobCardWorkflowService;
  let checkIn: JobCheckInService;
  let stages: JobStageService;
  let signing: typeof import("./job-opening-signature.service");
  const run = `${Date.now()}`;
  let branchName: string;
  let serviceTypeId: string;
  let modelId: string;
  let customerId: string;
  const users: Record<"advisor" | "supervisor" | "technician", { id: string; role: string }> = {} as never;

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Check-in tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    workflow = new (require("./job-card-workflow.service").JobCardWorkflowService)();
    checkIn = new (require("./job-check-in.service").JobCheckInService)();
    stages = new (require("./job-stage.service").JobStageService)();
    signing = require("./job-opening-signature.service");
    branchName = `Check-in fixture ${run}`;
    const branchId = (await db.branch.create({ data: { name: branchName } })).id;
    const person = async (key: keyof typeof users, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      const user = await db.user.create({
        data: { firstName: key, lastName: "Synthetic", email: `checkin-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
      });
      users[key] = { id: user.id, role };
    };
    await person("advisor", "ServiceAdviser");
    await person("supervisor", "WorkshopManager");
    await person("technician", "Technician");
    customerId = (await db.customer.create({ data: { firstName: "Adaeze", lastName: "Synthetic", branchId } })).id;
    modelId = (await db.workshopMaster.create({ data: { kind: "MODEL", code: `CI-M-${run}`, description: "Synthetic Sportage" } })).id;
    serviceTypeId = (await db.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: `CI-S-${run}`, description: "Periodic service" } })).id;
    await db.serviceTypeModelSetting.create({ data: { serviceTypeId, modelId, serviceCharge: 0 } });
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  /** Opens a job the way the slimmed opening form does: no bay and no technician. */
  async function openJob() {
    const vehicleId = (await db.vehicle.create({ data: { vin: `CHECKIN${run}${randomUUID().slice(0, 6)}`, customerId, catalogueId: modelId, customModel: "Synthetic Sportage", lastRecordedMileage: 43_100 } })).id;
    return workflow.open({
      branchName,
      customerId,
      vehicleId,
      serviceTypeId,
      serviceAdvisorId: users.advisor.id,
      description: "Noise from front left wheel when braking",
      mileage: 48_250,
      promisedAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      complaints: [{ description: "Noise from front left wheel when braking" }, { description: "AC not cooling well" }],
      createdById: users.advisor.id,
    });
  }

  const details = (overrides: Record<string, unknown> = {}) => ({
    customerId,
    mileage: 48_300,
    serviceTypeId,
    promisedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    complaints: [
      { description: "Noise from front left wheel when braking" },
      { description: "AC not cooling well" },
      { description: "Periodic service (50,000 km)" },
    ],
    instructionsToTechnician: "Check the front left brake and the AC cooling.",
    ...overrides,
  });

  it("opens without a bay, checks in, signs and hands off to the workshop supervisor", async () => {
    const job = await openJob();
    expect(job).toMatchObject({ stage: "CHECK_IN", bayId: null, technicianId: null, stageOwnerId: users.advisor.id });

    // Nothing recorded yet: the walk-around and the signature are missing.
    let view = await checkIn.get(job.id, users.advisor, { canUpdate: true });
    expect(view).toMatchObject({ editable: true, step: "WALK_AROUND", consentState: "required", previousReading: { km: 43_100 } });
    expect(view.gates.walkAround).toEqual(["Record the fuel level on Walk-around.", "Check every checklist item on Walk-around (25 not checked)."]);
    await expect(stages.act(job.id, { action: "SEND_TO_SUPERVISOR", requestId: randomUUID() }, users.advisor)).rejects.toMatchObject({
      statusCode: 409,
      details: { reasons: [...view.gates.walkAround, "Get the customer's signature on Customer consent."] },
    });

    // Details: mileage below the last reading needs the audited replacement.
    await expect(checkIn.saveDetails(job.id, details({ mileage: 40_000 }), users.advisor)).rejects.toMatchObject({
      statusCode: 400,
      details: { field: "mileage" },
    });
    view = await checkIn.saveDetails(job.id, details(), users.advisor);
    expect(view.record.instructionsToTechnician).toBe("Check the front left brake and the AC cooling.");
    const requests = await db.jobComplaint.findMany({ where: { jobCardId: job.id }, orderBy: { id: "asc" } });
    expect(requests.map((row) => row.description)).toEqual(details().complaints.map((row) => row.description));

    // Walk-around autosave with a version check, a damage mark and a photo.
    const saved = await checkIn.saveWalkAround(
      job.id,
      { expectedVersion: 0, fuelLevel: "HALF", checklist: { ...allPresent(), HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" }, serviceBookSeen: true, serviceBookStamps: 3, noValuables: true, belongingsNote: "Umbrella in boot" },
      users.advisor,
    );
    expect(saved.version).toBe(1);
    await expect(
      checkIn.saveWalkAround(job.id, { expectedVersion: 0, fuelLevel: "FULL", checklist: {}, serviceBookSeen: false, serviceBookStamps: null, noValuables: false }, users.advisor),
    ).rejects.toMatchObject({ statusCode: 409, code: "CHECK_IN_VERSION" });
    const markRequest = randomUUID();
    const mark = await checkIn.addDamageMark(job.id, { requestId: markRequest, type: "SCRATCH", x: 50, y: 95 }, users.advisor);
    expect(await checkIn.addDamageMark(job.id, { requestId: markRequest, type: "SCRATCH", x: 50, y: 95 }, users.advisor)).toEqual(mark);
    const dent = await checkIn.addDamageMark(job.id, { requestId: randomUUID(), type: "DENT", x: 80, y: 45 }, users.advisor);
    await checkIn.removeDamageMark(job.id, dent.id, users.advisor);
    const photo = await checkIn.addPhoto(job.id, { requestId: randomUUID(), category: "CHECK_IN", slot: "FRONT", image: SIGNATURE }, users.advisor);
    const replacement = await checkIn.addPhoto(job.id, { requestId: randomUUID(), category: "CHECK_IN", slot: "FRONT", image: SIGNATURE }, users.advisor);
    expect(await db.jobPhoto.count({ where: { jobCardId: job.id } })).toBe(1);
    expect(replacement.id).not.toBe(photo.id);
    expect((await checkIn.readPhoto(job.id, replacement.id)).contentType).toBe("image/png");

    view = await checkIn.get(job.id, users.advisor, { canUpdate: true });
    expect(view).toMatchObject({ step: "CUSTOMER_CONSENT", gates: { details: [], walkAround: [] } });
    expect(view.damageMarks).toEqual([{ ...mark, x: 50, y: 95 }]);
    expect(JSON.stringify(view)).not.toContain("base64");

    // The technician cannot change check-in.
    await expect(checkIn.saveDetails(job.id, details(), users.technician)).rejects.toMatchObject({ statusCode: 403, code: "CHECK_IN_LOCKED" });

    // Customer consent: the signed document covers the walk-around.
    const consent = await signing.getSignedOpeningConsent(job.id);
    expect(consent.document.version).toBe(2);
    expect(consent.document.scope).toMatchObject({ checkIn: { fuelLevel: "HALF", belongingsNote: "Umbrella in boot", damageMarks: [{ type: "SCRATCH" }] } });
    const key = randomUUID();
    const body = { accepted: true, expectedHash: consent.expectedHash, idempotencyKey: key, signerName: "Musa Driver", relationship: "Company driver", signerPhone: "0803 555 0199", signatureImage: SIGNATURE };
    const signed = await signing.signJobOpening(job.id, body, users.advisor.id);
    expect(await signing.signJobOpening(job.id, body, users.advisor.id)).toEqual(signed);
    expect(signed).toMatchObject({ revision: 1, signerPhone: "0803 555 0199" });
    await expect(signing.assertSignedJobOpening(db, job.id)).resolves.toBeUndefined();

    // Hand off: check-in to diagnosis, owned by the workshop supervisor role.
    const requestId = randomUUID();
    const after = await stages.act(job.id, { action: "SEND_TO_SUPERVISOR", requestId }, users.advisor);
    expect(after).toMatchObject({ stage: "DIAGNOSIS", owner: { id: null, role: "WorkshopManager" } });
    expect(await stages.act(job.id, { action: "SEND_TO_SUPERVISOR", requestId }, users.advisor)).toMatchObject({ stage: "DIAGNOSIS" });
    const record = await db.jobCheckIn.findUniqueOrThrow({ where: { jobCardId: job.id } });
    expect(record).toMatchObject({ completedById: users.advisor.id, completedAt: expect.any(Date) });
    expect(await db.auditLog.count({ where: { action: { in: ["JOB_CHECK_IN_DETAILS_SAVED", "JOB_WALK_AROUND_SAVED", "JOB_DAMAGE_MARK_ADDED", "JOB_PHOTO_ADDED", "JOB_OPENING_SIGNED", "JOB_STAGE_CHANGED"] }, details: { contains: job.id } } })).toBeGreaterThanOrEqual(6);

    // Check-in is closed now, and the signature still verifies.
    await expect(checkIn.saveDetails(job.id, details(), users.advisor)).rejects.toMatchObject({ statusCode: 409, code: "CHECK_IN_LOCKED" });
    expect((await checkIn.get(job.id, users.advisor, { canUpdate: true })).editable).toBe(false);
    await expect(signing.assertSignedJobOpening(db, job.id)).resolves.toBeUndefined();
  });

  it("makes the signature stale when the walk-around changes after signing", async () => {
    const job = await openJob();
    await checkIn.saveWalkAround(job.id, { expectedVersion: 0, fuelLevel: "FULL", checklist: allPresent(), serviceBookSeen: false, serviceBookStamps: null, noValuables: true }, users.advisor);
    const consent = await signing.getSignedOpeningConsent(job.id);
    await signing.signJobOpening(job.id, { accepted: true, expectedHash: consent.expectedHash, idempotencyKey: randomUUID(), signerName: "Adaeze Synthetic", signatureImage: SIGNATURE }, users.advisor.id);
    expect((await checkIn.get(job.id, users.advisor, { canUpdate: true })).step).toBe("SEND_TO_WORKSHOP");

    await checkIn.saveWalkAround(job.id, { expectedVersion: 1, fuelLevel: "QUARTER", checklist: allPresent(), serviceBookSeen: false, serviceBookStamps: null, noValuables: true }, users.advisor);
    const view = await checkIn.get(job.id, users.advisor, { canUpdate: true });
    expect(view.consentState).toBe("stale");
    expect(view.gates.consent).toEqual(["Details changed after the customer signed. Ask the customer to sign again on Customer consent."]);
  });

  it("keeps an old version 1 signature verifiable and current", async () => {
    const job = await openJob();
    const full = await db.jobCard.findUniqueOrThrow({
      where: { id: job.id },
      include: { customer: true, vehicle: true, branch: true, serviceType: true, service: true, complaints: { orderBy: { id: "asc" } } },
    });
    const { openingHash, openingEvidenceHash, SIGNED_OPENING_STATEMENT } = require("./job-opening-signature.logic");
    const content = { statement: SIGNED_OPENING_STATEMENT, terms: [], footer: null };
    const document = { version: 1, termsVersion: openingHash(content), ...content, scope: signing.openingJobScope(full) };
    const evidence = { documentHash: openingHash(document), signerName: "Adaeze Synthetic", relationship: null, capturedById: users.advisor.id, signedAt: new Date(), signatureImage: SIGNATURE };
    await db.jobOpeningSignature.create({
      data: { jobCardId: job.id, revision: 1, idempotencyKey: randomUUID(), snapshot: document, scopeHash: openingHash(document.scope), ...evidence, evidenceHash: openingEvidenceHash(evidence) },
    });
    expect((await signing.getSignedOpeningConsent(job.id)).state).toBe("signed");
    await expect(signing.assertSignedJobOpening(db, job.id)).resolves.toBeUndefined();
  });
});
