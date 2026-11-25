jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: { $transaction: jest.fn() },
}));
import prisma from "../../prisma/client";
import { Prisma } from "@prisma/client";
import { CsiResponseService } from "./csi-response.service";
import { PERMISSIONS } from "../../shared/constants/roles";
import type { Request, RequestHandler, Response } from "express";
import router from "./csi-response.routes";
import { CSI_REPORTS } from "../reports/csi.reports";
const frozen = {
  attributes: [
    {
      attributeId: "a",
      description: "Original question",
      weightage: new Prisma.Decimal(1),
    },
  ],
  responses: [
    {
      responseId: "good",
      description: "Original response",
      marks: new Prisma.Decimal(5),
    },
  ],
};
const previous = {
  id: "survey",
  generatedAt: new Date("2026-01-01"),
  version: 1,
  revision: frozen,
  responseDate: new Date("2026-01-01"),
  comments: "Previous feedback",
  score: new Prisma.Decimal(5),
  scorePercent: new Prisma.Decimal(100),
  answers: [
    {
      attributeId: "a",
      responseId: "good",
      attributeDescription: "Original question",
      responseDescription: "Original response",
      weightage: new Prisma.Decimal(1),
      marks: new Prisma.Decimal(5),
    },
  ],
};
const tx = {
  $queryRaw: jest.fn(),
  csiSurvey: { findFirst: jest.fn(), update: jest.fn() },
  csiSurveyAnswer: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
};
const scope = { branchId: "branch", actorId: "staff" };
const input = {
  version: 1,
  responseDate: "2026-01-02",
  comments: "Corrected feedback",
  answers: [{ attributeId: "a", responseId: "good" }],
};
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(
    (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
  );
  tx.csiSurvey.findFirst.mockResolvedValue(previous);
  tx.csiSurvey.update.mockResolvedValue({
    ...previous,
    version: 2,
    comments: input.comments,
  });
});
it("uses frozen questionnaire values and audits old answers during a correction", async () => {
  await new CsiResponseService().save(scope, "survey", input);
  expect(tx.csiSurvey.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "survey", branchId: "branch" } }),
  );
  expect(tx.csiSurvey.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: "RESPONDED",
        enteredById: "staff",
        version: { increment: 1 },
        answers: {
          create: [
            expect.objectContaining({
              attributeDescription: "Original question",
              responseDescription: "Original response",
            }),
          ],
        },
      }),
    }),
  );
  const audit = tx.auditLog.create.mock.calls[0][0] as {
    data: { action: string; details: string };
  };
  expect(audit.data.action).toBe("CSI_RESPONSE_CORRECTED");
  expect(JSON.parse(audit.data.details)).toMatchObject({
    previous: {
      version: 1,
      comments: "Previous feedback",
      answers: [
        expect.objectContaining({ attributeDescription: "Original question" }),
      ],
    },
    current: { version: 2 },
  });
});
it("rejects stale corrections, foreign surveys and dates outside the allowed bounds before deleting answers", async () => {
  await expect(
    new CsiResponseService().save(scope, "survey", { ...input, version: 0 }),
  ).rejects.toThrow("another staff");
  await expect(
    new CsiResponseService().save(scope, "survey", {
      ...input,
      responseDate: "2025-12-31",
    }),
  ).rejects.toThrow("response date");
  await expect(
    new CsiResponseService().save(scope, "survey", {
      ...input,
      responseDate: "2999-01-01",
    }),
  ).rejects.toThrow("response date");
  tx.csiSurvey.findFirst.mockResolvedValue(null);
  await expect(
    new CsiResponseService().save(scope, "foreign", input),
  ).rejects.toThrow("selected branch");
  expect(tx.csiSurveyAnswer.deleteMany).not.toHaveBeenCalled();
});
it("gates response reads and updates independently and registers one permission per report", () => {
  const routes = router.stack as {
    route?: { path: string; stack: { handle: RequestHandler }[] };
  }[];
  const request = (permissions: string[]) =>
    ({
      user: {
        userId: "staff",
        role: "Custom",
        branchId: "branch",
        permissions,
      },
    }) as unknown as Request;
  for (const [path, permission] of [
    ["/issued/:id", PERMISSIONS.CSI_RESPONSE_READ],
    ["/issued/:id/responses", PERMISSIONS.CSI_RESPONSE_UPDATE],
  ]) {
    const handler = routes.find((layer) => layer.route?.path === path)?.route
      ?.stack[0].handle;
    expect(handler).toBeDefined();
    expect(() => handler!(request([]), {} as Response, jest.fn())).toThrow(
      "required permissions",
    );
    const next = jest.fn();
    handler!(request([permission]), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  }
  expect(CSI_REPORTS.map((report) => report.permission)).toEqual([
    PERMISSIONS.CSI_REPORT,
    PERMISSIONS.CSI_ATTRIBUTE_REPORT,
    PERMISSIONS.CSI_CHECKLIST_REPORT,
  ]);
});
