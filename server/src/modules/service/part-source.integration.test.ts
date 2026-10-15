// Run only against a migrated, disposable database explicitly supplied by the caller.
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

jest.mock("../notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyRole: jest.fn(),
    notifyUsers: jest.fn(),
  })),
}));

import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../prisma/client";
import { ServiceService } from "./service.service";
import { InventoryService } from "../inventory/inventory.service";
import { assertRecordedScope } from "./estimate-approval";
import { ROLES } from "../../shared/constants/roles";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("Part sources on estimates (database)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prices each source separately, issues from the approved source and keeps sources apart in scope", async () => {
    const rollback = new Error("ROLLBACK_TEST_FIXTURES");
    const originalTransaction = prisma.$transaction.bind(prisma);

    await expect(
      originalTransaction(
        async (tx) => {
          const suffix = randomUUID();
          const branch = await tx.branch.create({ data: { name: `part-source-${suffix}` } });
          const role = await tx.role.upsert({ where: { name: ROLES.SERVICE_ADVISOR }, update: {}, create: { name: ROLES.SERVICE_ADVISOR } });
          const user = await tx.user.create({
            data: { email: `${suffix}@example.test`, firstName: "Test", lastName: "Advisor", passwordHash: "not-a-login", roleId: role.id, branchId: branch.id },
          });
          const customer = await tx.customer.create({ data: { firstName: "Test", lastName: "Owner", phoneNumber: suffix, branchId: branch.id } });
          const vehicle = await tx.vehicle.create({ data: { vin: suffix, customModel: "Integration fixture", customerId: customer.id, lastRecordedMileage: 100 } });
          // A Mobis part that can also be fitted as a local purchase or second-hand part.
          const part = await tx.sparePart.create({ data: { partNumber: suffix, name: "Brake pad", partFlag: "O", unitPrice: 1000, retailRate: 2000 } });
          await tx.inventoryStock.create({ data: { branchId: branch.id, partId: part.id, quantity: 10 } });
          const bay = await tx.workshopMaster.create({ data: { kind: "BAY", code: suffix, description: "Bay" } });
          const team = await tx.workshopMaster.create({ data: { kind: "TEAM", code: suffix, description: "Team" } });
          const serviceType = await tx.workshopMaster.create({ data: { kind: "SERVICE_TYPE", code: suffix, description: "Brake check" } });
          const model = await tx.workshopMaster.create({ data: { kind: "MODEL", code: suffix, description: "Model" } });
          await tx.vehicle.update({ where: { id: vehicle.id }, data: { catalogueId: model.id } });
          await tx.serviceTypeModelSetting.create({ data: { serviceTypeId: serviceType.id, modelId: model.id, serviceCharge: 1000 } });

          const spies = [
            jest.spyOn(prisma, "$transaction").mockImplementation(((callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof prisma.$transaction),
            jest.spyOn(prisma.sparePart, "findUnique").mockImplementation(tx.sparePart.findUnique.bind(tx.sparePart) as typeof prisma.sparePart.findUnique),
            jest.spyOn(prisma.sparePartSourcePrice, "findUnique").mockImplementation(tx.sparePartSourcePrice.findUnique.bind(tx.sparePartSourcePrice) as typeof prisma.sparePartSourcePrice.findUnique),
            jest.spyOn(prisma.estimate, "findUnique").mockImplementation(tx.estimate.findUnique.bind(tx.estimate) as typeof prisma.estimate.findUnique),
            jest.spyOn(prisma.user, "findUnique").mockImplementation(tx.user.findUnique.bind(tx.user) as typeof prisma.user.findUnique),
            jest.spyOn(prisma.jobCard, "findUnique").mockImplementation(tx.jobCard.findUnique.bind(tx.jobCard) as typeof prisma.jobCard.findUnique),
            jest.spyOn(prisma.branch, "findUnique").mockImplementation(tx.branch.findUnique.bind(tx.branch) as typeof prisma.branch.findUnique),
            jest.spyOn(prisma.customer, "findUnique").mockImplementation(tx.customer.findUnique.bind(tx.customer) as typeof prisma.customer.findUnique),
            jest.spyOn(prisma.inventoryStock, "findUnique").mockImplementation(tx.inventoryStock.findUnique.bind(tx.inventoryStock) as typeof prisma.inventoryStock.findUnique),
          ];

          try {
            const inventory = new InventoryService();
            await expect(inventory.setSourcePrices(part.id, [{ source: "O", retailRate: 1 }])).rejects.toThrow("own source");
            const prices = await inventory.setSourcePrices(part.id, [
              { source: "L", retailRate: 1500, dealerRate: 900 },
              { source: "U", retailRate: 600 },
            ]);
            expect(prices.prices.map((p) => [p.source, p.retailRate])).toEqual([["L", 1500], ["U", 600]]);
            await expect(inventory.updatePart(part.id, { partFlag: "L" })).rejects.toThrow("Local purchase source price");

            const jobs = new ServiceService();
            const job = await jobs.createJobCard({
              customerId: customer.id,
              vehicleId: vehicle.id,
              branchName: branch.name,
              serviceTypeId: serviceType.id,
              bayId: bay.id,
              teamId: team.id,
              promisedAt: new Date(Date.now() + 3600000).toISOString(),
              description: "Brake noise",
              serviceAdvisorId: user.id,
              mileage: 150,
              complaints: [{ description: "Brake noise" }],
              createdById: user.id,
            });

            const service = { type: "SERVICE" as const, referenceId: serviceType.id, quantity: 1 };
            const parts = (lines: { partSource?: "O" | "L" | "U" | "R" }[]) => lines.map((line) => ({ type: "PART" as const, referenceId: part.id, quantity: 1, ...line }));
            // No repaired price is set for this part.
            await expect(jobs.addEstimate(job.id, { description: "Quote", lines: [service, ...parts([{ partSource: "R" }])] })).rejects.toThrow("Repaired price is not set");
            // The part's own source given explicitly and by default is the same line twice.
            await expect(jobs.addEstimate(job.id, { description: "Quote", lines: [service, ...parts([{}, { partSource: "O" }])] })).rejects.toThrow("once per source");

            const mobis = await jobs.addEstimate(job.id, { description: "Quote", lines: [service, { type: "PART", referenceId: part.id, quantity: 2 }] });
            expect(mobis.lines.find((l) => l.type === "PART")).toMatchObject({ partSource: "O", rate: 2000, amount: 4000 });

            // Customer finds it too expensive: the revision fits one used and one local pad instead.
            const revised = await jobs.addEstimate(job.id, { description: "Revised quote", lines: [service, ...parts([{ partSource: "U" }, { partSource: "L" }])] });
            const partLines = revised.lines.filter((l) => l.type === "PART");
            expect(partLines.map((l) => [l.partSource, l.rate])).toEqual([["U", 600], ["L", 1500]]);
            expect(partLines.reduce((sum, l) => sum + l.amount, 0)).toBe(2100);
            await jobs.addApproval(revised.id, { customerId: customer.id, approved: true });

            const issue = (partSource?: string) => inventory.createPartIssuance({ branchId: branch.id, sparePartId: part.id, jobCardId: job.id, issuedById: user.id, quantity: 1, partSource });
            await expect(issue()).rejects.toThrow("more than one source");
            await expect(issue("O")).rejects.toThrow("Not in approved scope");
            expect((await issue("U")).partSource).toBe("U");
            await expect(issue("U")).rejects.toThrow("Quantity / hours exceed approval");
            expect((await issue("L")).partSource).toBe("L");

            const review = await assertRecordedScope(tx, job.id);
            expect(review.rows.filter((r) => r.type === "PART").map((r) => [r.partSource, r.actualAmount])).toEqual([["U", 600], ["L", 1500]]);
          } finally {
            spies.forEach((spy) => spy.mockRestore());
          }
          throw rollback;
        },
        { maxWait: 10000, timeout: 60000 },
      ),
    ).rejects.toBe(rollback);
  });
});
