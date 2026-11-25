jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    jobCard: { findMany: jest.fn() },
    csiCardRevision: { findMany: jest.fn() },
    workshopMaster: { findFirst: jest.fn() },
  },
}));
import prisma from "../../prisma/client";
import type { Request, RequestHandler, Response } from "express";
import { CsiIssuanceService } from "./csi-issuance.service";
import router from "./csi-issuance.routes";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from "../../shared/constants/roles";
import { issuanceQuery } from "./csi-issuance.validation";

const scope = { branchId: "branch", actorId: "staff" };
const job = () => ({
  id: "job",
  jobNumber: "JOB1",
  status: "DELIVERED",
  createdAt: new Date("2026-11-01"),
  deliveredAt: new Date("2026-11-02"),
  mileage: 100,
  branch: { name: "Test workshop" },
  customer: {
    firstName: "Test",
    lastName: "Customer",
    address: "Test address",
  },
  vehicle: { vin: "SYNTHETIC-VIN", registrationNumber: "TEST" },
  serviceType: { code: "RG", category: "PAID" },
  csiSurvey: null as { id: string } | null,
});
const card = {
  id: "revision",
  cardId: "card",
  version: 1,
  effectiveDate: new Date("2026-01-01"),
  appliesTo: "BOTH",
  attributes: [],
  responses: [],
};
const tx = {
  $queryRaw: jest.fn(),
  jobCard: { findFirst: jest.fn() },
  csiCardRevision: { findMany: jest.fn() },
  csiSurvey: { create: jest.fn(), findMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(
    (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  );
  tx.jobCard.findFirst.mockResolvedValue(job());
  tx.csiCardRevision.findMany.mockResolvedValue([card]);
  tx.csiSurvey.create.mockResolvedValue({ id: "survey" });
});
it("creates a snapshotted survey with an audit and scoped row lock", async () => {
  expect(await new CsiIssuanceService().generate(scope, ["job"])).toEqual({
    surveyIds: ["survey"],
    created: 1,
    reused: 0,
  });
  expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  expect(tx.jobCard.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "job", branchId: "branch" } }),
  );
  expect(tx.csiSurvey.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      branchId: "branch",
      jobCardId: "job",
      revisionId: "revision",
      generatedById: "staff",
      jobSnapshot: expect.objectContaining({
        jobNumber: "JOB1",
        customer: "Test Customer",
        registration: "TEST",
      }),
    }),
  });
  expect(tx.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ action: "CSI_CARDS_GENERATED" }),
    }),
  );
});
it("reuses an existing survey without reselecting a changed card or rewriting snapshots", async () => {
  tx.jobCard.findFirst.mockResolvedValue({
    ...job(),
    csiSurvey: { id: "original" },
  });
  expect(await new CsiIssuanceService().generate(scope, ["job"])).toEqual({
    surveyIds: ["original"],
    created: 0,
    reused: 1,
  });
  expect(tx.csiCardRevision.findMany).not.toHaveBeenCalled();
  expect(tx.csiSurvey.create).not.toHaveBeenCalled();
});
it("rejects cross-branch and undelivered jobs before creating any survey", async () => {
  tx.jobCard.findFirst.mockResolvedValue(null);
  await expect(
    new CsiIssuanceService().generate(scope, ["foreign"]),
  ).rejects.toThrow("not found");
  tx.jobCard.findFirst.mockResolvedValue({ ...job(), status: "READY" });
  await expect(
    new CsiIssuanceService().generate(scope, ["job"]),
  ).rejects.toThrow("Deliver");
  expect(tx.csiSurvey.create).not.toHaveBeenCalled();
});
it("prints the requested order within the authorized branch and refuses missing surveys", async () => {
  tx.csiSurvey.findMany.mockResolvedValue([{ id: "b" }, { id: "a" }]);
  expect(await new CsiIssuanceService().print(scope, ["a", "b"])).toEqual({
    surveys: [{ id: "a" }, { id: "b" }],
  });
  expect(tx.csiSurvey.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { branchId: "branch", id: { in: ["a", "b"] } },
    }),
  );
  tx.csiSurvey.findMany.mockResolvedValue([]);
  await expect(
    new CsiIssuanceService().print(scope, ["foreign"]),
  ).rejects.toThrow("not found");
});
it("requires generation permission at the router and grants it through the role seed", () => {
  const guard = (router.stack as { handle: RequestHandler }[])[0].handle;
  const request = (permissions: string[]) =>
    ({
      user: {
        userId: "staff",
        role: "Custom",
        branchId: "branch",
        permissions,
      },
    }) as unknown as Request;
  expect(() => guard(request([]), {} as Response, jest.fn())).toThrow(
    "required permissions",
  );
  const next = jest.fn();
  guard(request([PERMISSIONS.CSI_CARD_GENERATE]), {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  for (const role of [
    ROLES.SERVICE_MANAGER,
    ROLES.CCU_MANAGER,
    ROLES.CCU_OFFICER,
  ])
    expect(ROLE_PERMISSIONS[role]).toContain(PERMISSIONS.CSI_CARD_GENERATE);
  expect(ROLE_PERMISSIONS[ROLES.WORKSHOP_MANAGER]).not.toContain(
    PERMISSIONS.CSI_CARD_GENERATE,
  );
});
it("keeps candidate filters branch-scoped and uses inclusive Lagos job dates", async () => {
  (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([job()]);
  (prisma.csiCardRevision.findMany as jest.Mock).mockResolvedValue([
    { ...card, code: "C1", description: "Test card" },
  ]);
  const result = await new CsiIssuanceService().candidates(
    "branch",
    issuanceQuery.parse({
      from: "2026-11-01",
      to: "2026-11-02",
      registration: "TEST",
    }),
  );
  expect(prisma.jobCard.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        branchId: "branch",
        status: { in: ["DELIVERED", "Delivered"] },
        deliveredAt: { not: null },
        createdAt: {
          gte: new Date("2026-11-01T00:00:00+01:00"),
          lt: new Date("2026-11-03T00:00:00+01:00"),
        },
        vehicle: {
          registrationNumber: { equals: "TEST", mode: "insensitive" },
        },
      }),
    }),
  );
  expect(result.items[0]).toMatchObject({
    card: "C1",
    canGenerate: true,
    reason: null,
  });
});
it("requires narrower filters instead of truncating a large generation preview", async () => {
  (prisma.jobCard.findMany as jest.Mock).mockResolvedValue(
    Array.from({ length: 1001 }, () => job()),
  );
  (prisma.csiCardRevision.findMany as jest.Mock).mockResolvedValue([]);
  await expect(
    new CsiIssuanceService().candidates("branch", issuanceQuery.parse({})),
  ).rejects.toThrow("Narrow");
});
it("does not reselect or invalidate an issued card when current masters become ambiguous", async () => {
  (prisma.jobCard.findMany as jest.Mock).mockResolvedValue([
    {
      ...job(),
      csiSurvey: {
        id: "survey",
        revision: { code: "ORIGINAL", description: "Original questionnaire" },
      },
    },
  ]);
  (prisma.csiCardRevision.findMany as jest.Mock).mockResolvedValue([
    card,
    { ...card, id: "other", cardId: "other" },
  ]);
  const result = await new CsiIssuanceService().candidates(
    "branch",
    issuanceQuery.parse({}),
  );
  expect(result.items[0]).toMatchObject({
    surveyId: "survey",
    card: "ORIGINAL",
    reason: null,
    canGenerate: false,
  });
});
