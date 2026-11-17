jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    partIssuance: { findUnique: jest.fn(), update: jest.fn() },
    partCollectionSignature: { create: jest.fn() },
    jobcardNotificationEvent: { upsert: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    jobCard: {
      groupBy: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  },
}));
jest.mock("../notification/workshop-notifications", () => ({
  notifyWorkshopEvent: jest.fn(),
}));
jest.mock("../notification/jobcard-notification-router", () => ({
  setNotificationActor: jest.fn(),
}));
import prisma from "../../prisma/client";
import { WorkshopService } from "./workshop.service";
import { WorkshopRepository } from "./workshop.repository";
import { receivePartsSchema } from "./workshop.validation";
const signature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=";
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation((callback) =>
    callback(prisma),
  );
});
it("records assigned technician identity and server time, once per issuance", async () => {
  const issue = {
    id: "issue",
    jobCardId: "job",
    sparePartId: "part",
    quantity: 2,
    partSource: "O",
    jobCard: { id: "job", technicianId: "tech", status: "IN_PROGRESS" },
    receivedAt: null,
  };
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue(issue);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    isActive: true,
    role: { name: "Technician" },
  });
  await new WorkshopService().receiveParts("issue", "tech", signature);
  expect(prisma.partCollectionSignature.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      issuanceId: "issue",
      signerId: "tech",
      signatureImage: signature,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      signedAt: expect.any(Date),
    }),
  });
  expect(prisma.partIssuance.update).toHaveBeenCalledWith({
    where: { id: "issue" },
    data: { receivedById: "tech", receivedAt: expect.any(Date) },
  });
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({
    ...issue,
    receivedAt: new Date(),
  });
  await new WorkshopService().receiveParts("issue", "tech", signature);
  expect(prisma.partIssuance.update).toHaveBeenCalledTimes(1);
  expect(prisma.partCollectionSignature.create).toHaveBeenCalledTimes(1);
  await expect(
    new WorkshopService().receiveParts("issue", "other", signature),
  ).rejects.toThrow("assigned technician");
});

it("requires bounded signature evidence and rejects invalid images before opening a transaction", async () => {
  const params = { id: "11111111-1111-4111-8111-111111111111" };
  expect(
    receivePartsSchema.safeParse({ params, body: { confirmed: true } }).success,
  ).toBe(false);
  expect(
    receivePartsSchema.safeParse({
      params,
      body: { confirmed: true, signatureImage: signature, signerId: "other" },
    }).success,
  ).toBe(false);
  await expect(
    new WorkshopService().receiveParts(
      "issue",
      "tech",
      "data:image/svg+xml;base64,AAAA",
    ),
  ).rejects.toThrow("PNG");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it.each(["READY", "BILLED", "DELIVERED", "CANCELLED"])(
  "refuses new collection evidence on a %s job",
  async (status) => {
    (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({
      jobCardId: "job",
      jobCard: { id: "job", technicianId: "tech", status },
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      role: { name: "Technician" },
    });
    await expect(
      new WorkshopService().receiveParts("issue", "tech", signature),
    ).rejects.toThrow("no longer open");
    expect(prisma.partCollectionSignature.create).not.toHaveBeenCalled();
  },
);

it("does not mark collection received when signature persistence fails", async () => {
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({
    jobCardId: "job",
    jobCard: { id: "job", technicianId: "tech", status: "IN_PROGRESS" },
  });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    isActive: true,
    role: { name: "Technician" },
  });
  (prisma.partCollectionSignature.create as jest.Mock).mockRejectedValueOnce(
    new Error("storage failed"),
  );
  await expect(
    new WorkshopService().receiveParts("issue", "tech", signature),
  ).rejects.toThrow("storage failed");
  expect(prisma.partIssuance.update).not.toHaveBeenCalled();
});

it("rejects collection by a technician moved to a different branch", async () => {
  (prisma.partIssuance.findUnique as jest.Mock).mockResolvedValue({
    jobCardId: "job",
    branchId: "branch",
    jobCard: { id: "job", technicianId: "tech", status: "IN_PROGRESS" },
  });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    isActive: true,
    branchId: "other",
    role: { name: "Technician" },
  });
  await expect(
    new WorkshopService().receiveParts("issue", "tech", signature),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(prisma.partCollectionSignature.create).not.toHaveBeenCalled();
});

it("keeps historical inactive users in the directory but excludes them from assignment queries", async () => {
  (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
  const repository = new WorkshopRepository();
  await repository.listTechnicians({ branchId: "branch", activeOnly: true });
  expect(prisma.user.findMany).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ branchId: "branch", isActive: true }),
    }),
  );
  await repository.listTechnicians({ branchId: "branch" });
  const where = (prisma.user.findMany as jest.Mock).mock.calls[1][0].where;
  expect(where).not.toHaveProperty("isActive");
});

it("refuses reassignment when billing completes before the job lock is acquired", async () => {
  const find = jest
    .spyOn(WorkshopRepository.prototype, "findJobCardById")
    .mockResolvedValue({
      id: "job",
      branchId: "branch",
      status: "OPEN",
    } as never);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    isActive: true,
    branchId: "branch",
    role: { name: "Technician" },
  });
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    id: "job",
    status: "BILLED",
  });
  await expect(
    new WorkshopService().assignTechnician("job", "tech", undefined, "actor"),
  ).rejects.toThrow("no longer open");
  expect(prisma.jobCard.update).not.toHaveBeenCalled();
  find.mockRestore();
});
it("aggregates open and closed counts in one group query", async () => {
  const list = jest
    .spyOn(WorkshopRepository.prototype, "listTechnicians")
    .mockResolvedValue([{ id: "tech" }] as never);
  (prisma.user.count as jest.Mock).mockResolvedValue(1);
  (prisma.jobCard.groupBy as jest.Mock).mockResolvedValue([
    { technicianId: "tech", status: "IN_PROGRESS", _count: { _all: 2 } },
    { technicianId: "tech", status: "DELIVERED", _count: { _all: 3 } },
  ]);
  const result = await new WorkshopService().listTechnicians();
  expect(result.technicians[0]).toMatchObject({ openJobs: 2, closedJobs: 3 });
  expect(prisma.jobCard.groupBy).toHaveBeenCalledTimes(1);
  list.mockRestore();
});

it("filters assignment choices to active technicians without changing the directory default", async () => {
  const list = jest
    .spyOn(WorkshopRepository.prototype, "listTechnicians")
    .mockResolvedValue([]);
  (prisma.user.count as jest.Mock).mockResolvedValue(0);
  await new WorkshopService().listTechnicians({
    branchId: "branch",
    activeOnly: true,
  });
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ branchId: "branch", activeOnly: true }),
  );
  expect(prisma.user.count).toHaveBeenCalledWith({
    where: expect.objectContaining({ branchId: "branch", isActive: true }),
  });
  expect(prisma.jobCard.groupBy).not.toHaveBeenCalled();
  list.mockRestore();
});

it("assigns a branch technician and audits old and new assignments in the transaction", async () => {
  const find = jest
    .spyOn(WorkshopRepository.prototype, "findJobCardById")
    .mockResolvedValue({
      id: "job",
      branchId: "branch",
      status: "OPEN",
      billedAt: null,
    } as never);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    isActive: true,
    role: { name: "Technician" },
    branchId: "branch",
  });
  (prisma.jobCard.findUniqueOrThrow as jest.Mock).mockResolvedValue({
    id: "job",
    status: "OPEN",
    technicianId: "old",
  });
  (prisma.jobCard.update as jest.Mock).mockResolvedValue({
    id: "job",
    technicianId: "tech",
  });
  await expect(
    new WorkshopService().assignTechnician("job", "tech", undefined, "actor"),
  ).resolves.toMatchObject({ technicianId: "tech" });
  expect(prisma.auditLog.create).toHaveBeenCalledWith({
    data: {
      userId: "actor",
      action: "TECHNICIAN_ASSIGNED",
      details: JSON.stringify({
        jobCardId: "job",
        previousTechnicianId: "old",
        technicianId: "tech",
      }),
    },
  });
  find.mockRestore();
});
