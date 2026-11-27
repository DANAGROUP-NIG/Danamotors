import type { JobStage, PrismaClient } from "@prisma/client";
import type { loadWorkshopBoard as LoadBoard } from "./job-board.service";
import { boardFilter } from "./job-board.logic";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;
jest.setTimeout(120000);

describeDb("Workshop board: scoping, filters, cap and counts on isolated local PostgreSQL (job card revamp phase 10)", () => {
  let db: PrismaClient;
  let loadWorkshopBoard: typeof LoadBoard;
  const run = `${Date.now()}`;
  let branchId: string;
  let otherBranchId: string;
  let advisorId: string;
  let otherAdvisorId: string;
  let technicianId: string;
  let ownerId: string;
  let vehicleId: string;
  let customerId: string;
  let sequence = 0;
  const now = new Date("2026-11-27T14:00:00Z");
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  const job = (stage: JobStage, status: string, extra: Record<string, unknown> = {}) =>
    db.jobCard.create({
      data: {
        jobNumber: `BRD-${run}-${++sequence}`,
        description: "Periodic service",
        branchId,
        stage,
        status,
        stageEnteredAt: minutesAgo(sequence),
        serviceAdvisorId: advisorId,
        vehicleId,
        customerId,
        createdAt: new Date("2026-11-27T08:00:00Z"),
        ...extra,
      },
    });

  beforeAll(async () => {
    if (!database || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname))
      throw new Error("Workshop board tests require a disposable localhost database");
    process.env.DATABASE_URL = database;
    db = require("../../prisma/client").default;
    loadWorkshopBoard = require("./job-board.service").loadWorkshopBoard;
    branchId = (await db.branch.create({ data: { name: `Board fixture ${run}` } })).id;
    otherBranchId = (await db.branch.create({ data: { name: `Board other ${run}` } })).id;
    const person = async (key: string, role: string) => {
      const roleId = (await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } })).id;
      return (
        await db.user.create({
          data: { firstName: key, lastName: "Synthetic", email: `brd-${key}-${run}@example.test`, passwordHash: "test-fixture-not-a-login-hash", roleId, branchId },
        })
      ).id;
    };
    advisorId = await person("advisor", "ServiceAdviser");
    otherAdvisorId = await person("advisor2", "ServiceAdviser");
    technicianId = await person("technician", "Technician");
    ownerId = await person("musa", "Technician");
    customerId = (await db.customer.create({ data: { firstName: "Chioma", lastName: "Synthetic", branchId, phoneNumber: "0803 555 0177" } })).id;
    vehicleId = (await db.vehicle.create({ data: { registrationNumber: `BRD ${run.slice(-3)} AA`, make: "Kia", model: "Rio", customModel: "Rio", vin: `KNABRD${run}`.slice(0, 17), customerId } })).id;

    await job("CHECK_IN", "OPEN", { promisedAt: minutesAgo(30) });
    await job("DIAGNOSIS", "OPEN", { stageOwnerId: ownerId, stageOwnerRole: "Technician", technicianId, warrantyStatusAtCreation: "ACTIVE" });
    await job("ESTIMATE", "OPEN", { serviceAdvisorId: otherAdvisorId, promisedAt: minutesAgo(5) });
    await job("REPAIR", "IN_PROGRESS", { technicianId });
    await job("REPAIR", "WAITING_PARTS", { technicianId, promisedAt: new Date(now.getTime() + 3_600_000) });
    await job("BILLING", "READY", { promisedAt: minutesAgo(600) });
    await job("DELIVERY", "BILLED");
    // Off the board: closed, cancelled, PDI, another branch, and a job received the day before.
    await job("CLOSED", "DELIVERED");
    await job("CANCELLED", "CANCELLED");
    await job("REPAIR", "IN_PROGRESS", { jobType: "PDI" });
    await job("REPAIR", "IN_PROGRESS", { branchId: otherBranchId, serviceAdvisorId: null });
    await job("QUALITY_CHECK", "QC", { createdAt: new Date("2026-11-26T08:00:00Z") });
  });

  afterAll(async () => {
    if (!db) return;
    // Only this run's rows; an ID that was never set leaves its table alone.
    await db.jobCard.deleteMany({ where: { jobNumber: { startsWith: `BRD-${run}-` } } });
    if (vehicleId) await db.vehicle.delete({ where: { id: vehicleId } });
    if (customerId) await db.customer.delete({ where: { id: customerId } });
    await db.user.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } });
    await db.branch.deleteMany({ where: { name: { in: [`Board fixture ${run}`, `Board other ${run}`] } } });
    await db.$disconnect();
  });

  const totals = (board: Awaited<ReturnType<typeof LoadBoard>>) => Object.fromEntries(board.columns.map((column) => [column.key, column.total]));

  it("shows only the branch's active service jobs, by column, with the summary figures", async () => {
    const board = await loadWorkshopBoard(boardFilter({}, branchId), now);
    expect(totals(board)).toEqual({
      CHECK_IN: 1,
      DIAGNOSIS: 1,
      WARRANTY: 0,
      AWAITING_APPROVAL: 1,
      IN_REPAIR: 1,
      WAITING_PARTS: 1,
      QUALITY_CHECK: 1,
      READY: 2,
    });
    // In workshop: diagnosis, estimate, repair, waiting parts and quality check. Overdue: check-in and estimate (Ready is not counted).
    expect(board.summary).toEqual({ inWorkshop: 5, awaitingApproval: 1, waitingParts: 1, readyForCollection: 2, overdue: 2 });
    const cards = board.columns.flatMap((column) => column.cards);
    expect(cards).toHaveLength(8);
    expect(board.columns.find((column) => column.key === "CHECK_IN")?.targetMinutes).toBe(30);
    expect(board.columns.find((column) => column.key === "IN_REPAIR")?.targetMinutes).toBeNull();

    const diagnosis = board.columns.find((column) => column.key === "DIAGNOSIS")!.cards[0];
    expect(diagnosis).toMatchObject({ plate: `BRD ${run.slice(-3)} AA`, model: "Kia Rio", customer: "Chioma Synthetic", warranty: true, repeat: null });
    expect(diagnosis.owner).toEqual({ name: "musa Synthetic", role: "Technician" });
    // The delivery job entered its step a minute before the billing one: longest in the step first.
    expect(board.columns.find((column) => column.key === "READY")!.cards.map((card) => card.stage)).toEqual(["DELIVERY", "BILLING"]);
  });

  it("filters by service advisor, technician and received day", async () => {
    const byAdvisor = await loadWorkshopBoard(boardFilter({ advisorId: otherAdvisorId }, branchId), now);
    expect(byAdvisor.columns.flatMap((column) => column.cards).map((card) => card.stage)).toEqual(["ESTIMATE"]);
    expect(byAdvisor.summary).toMatchObject({ awaitingApproval: 1, inWorkshop: 1, overdue: 1 });

    const byTechnician = await loadWorkshopBoard(boardFilter({ technicianId }, branchId), now);
    expect(totals(byTechnician)).toMatchObject({ DIAGNOSIS: 1, IN_REPAIR: 1, WAITING_PARTS: 1, READY: 0 });

    const yesterday = await loadWorkshopBoard(boardFilter({ date: "2026-11-26" }, branchId), now);
    expect(yesterday.columns.flatMap((column) => column.cards).map((card) => card.stage)).toEqual(["QUALITY_CHECK"]);

    const otherBranch = await loadWorkshopBoard(boardFilter({}, otherBranchId), now);
    expect(otherBranch.summary.inWorkshop).toBe(1);
    expect(otherBranch.columns.flatMap((column) => column.cards).every((card) => card.stage === "REPAIR")).toBe(true);
  });

  it("caps a column at 50 cards while the total and figures count every job", async () => {
    const before = await db.jobCard.count({ where: { branchId } });
    await db.jobCard.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        jobNumber: `BRD-${run}-cap-${index}`,
        description: "Periodic service",
        branchId,
        stage: "REPAIR" as const,
        status: "IN_PROGRESS",
        stageEnteredAt: minutesAgo(1000 + index),
        createdAt: new Date("2026-11-27T08:00:00Z"),
      })),
    });
    expect(await db.jobCard.count({ where: { branchId } })).toBe(before + 55);
    const board = await loadWorkshopBoard(boardFilter({}, branchId), now);
    const repair = board.columns.find((column) => column.key === "IN_REPAIR")!;
    expect(repair.total).toBe(56);
    expect(repair.cards).toHaveLength(50);
    // The longest waiting first: the oldest capped job leads the column.
    expect(repair.cards[0].jobNumber).toBe(`BRD-${run}-cap-54`);
    expect(board.summary.inWorkshop).toBe(60);
  });
});
