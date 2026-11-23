jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: { jobCard: { findUnique: jest.fn() } },
}));
import type { Request, RequestHandler, Response } from "express";
import prisma from "../../prisma/client";
import { jobOpeningSignatureRoutes } from "./job-opening-signature.routes";
import { PERMISSIONS } from "../../shared/constants/roles";

type Layer = {
  handle: RequestHandler;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: RequestHandler }[];
  };
};
const layers = jobOpeningSignatureRoutes.stack as Layer[];
const id = "11111111-1111-4111-8111-111111111111";
const request = (permissions: string[], branchId: string | null = "home") =>
  ({
    params: { id },
    user: { userId: "actor", role: "Custom", permissions, branchId },
    body: {},
  }) as unknown as Request;
beforeEach(() => jest.resetAllMocks());

it("requires job read permission for every operation and customer capture/print permissions separately", () => {
  const base = layers.filter((layer) => !layer.route)[0].handle;
  expect(() => base(request([]), {} as Response, jest.fn())).toThrow(
    "required permissions",
  );
  const post = layers.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.post,
  )?.route?.stack;
  const print = layers.find(
    (layer) => layer.route?.path === "/:signatureId/print",
  )?.route?.stack;
  if (!post || !print) throw new Error("Missing signature operations");
  expect(() =>
    post[0].handle(
      request([PERMISSIONS.JOBCARD_READ]),
      {} as Response,
      jest.fn(),
    ),
  ).toThrow("required permissions");
  expect(() =>
    print[0].handle(
      request([PERMISSIONS.JOBCARD_READ]),
      {} as Response,
      jest.fn(),
    ),
  ).toThrow("required permissions");
  const next = jest.fn();
  post[0].handle(request([PERMISSIONS.ESTIMATE_SIGN]), {} as Response, next);
  expect(next).toHaveBeenCalled();
});

it("rejects foreign branches and branchless accounts before reading any signed evidence", async () => {
  const guard = layers.filter((layer) => !layer.route)[1].handle;
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    branchId: "other",
  });
  for (const branch of ["home", null]) {
    const next = jest.fn();
    await guard(
      request([PERMISSIONS.JOBCARD_READ], branch),
      {} as Response,
      next,
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  }
});

it("preserves parent job params and signature body across branch and request validation", async () => {
  const guard = layers.filter((layer) => !layer.route)[1].handle;
  const post = layers.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.post,
  )?.route?.stack;
  if (!post) throw new Error("Missing capture route");
  const req = request([PERMISSIONS.JOBCARD_READ, PERMISSIONS.ESTIMATE_SIGN]);
  req.body = {
    accepted: true,
    expectedHash: "0".repeat(64),
    idempotencyKey: id,
    signerName: "Synthetic customer",
    signatureImage: "data:image/png;base64,fixture",
  };
  (prisma.jobCard.findUnique as jest.Mock).mockResolvedValue({
    branchId: "home",
  });
  const next = jest.fn();
  await guard(req, {} as Response, next);
  expect(req.body.signerName).toBe("Synthetic customer");
  await post[1].handle(req, {} as Response, next);
  expect(req.params.id).toBe(id);
  expect(req.body.signerName).toBe("Synthetic customer");
  expect(next).toHaveBeenCalledTimes(2);
});

it("reports field paths and issue codes for missing signature evidence", async () => {
  const post = layers.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.post,
  )?.route?.stack;
  if (!post) throw new Error("Missing capture route");
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  } as unknown as Response;
  await post[1].handle(request([PERMISSIONS.ESTIMATE_SIGN]), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      code: "FIELD_VALIDATION",
      errors: expect.arrayContaining([
        expect.objectContaining({
          field: "signatureImage",
          code: "invalid_type",
        }),
      ]),
    }),
  );
});
