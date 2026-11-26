jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: { jobCard: { findUnique: jest.fn() } },
}));
const saveFinding = jest.fn().mockResolvedValue({ id: "finding", version: 2 });
jest.mock("./job-diagnosis.service", () => ({
  JobDiagnosisService: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue({ editable: true }),
    bays: jest.fn().mockResolvedValue({ bays: [] }),
    labourOptions: jest.fn().mockResolvedValue({ options: [] }),
    partOptions: jest.fn().mockResolvedValue({ options: [] }),
    saveFinding,
    removeFinding: jest.fn(),
    addFindingPhoto: jest.fn(),
    removeFindingPhoto: jest.fn(),
  })),
}));
import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import prisma from "../../prisma/client";
import { jobDiagnosisRoutes } from "./job-diagnosis.routes";
import { PERMISSIONS } from "../../shared/constants/roles";

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] }; handle: RequestHandler };
const id = "11111111-1111-4111-8111-111111111111";
const findingId = "33333333-3333-4333-8333-333333333333";
const routeStack = (router: Router, path: string, method: "get" | "put" | "post" | "delete") => {
  const layers = router.stack as unknown as Layer[];
  const layer = layers.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) throw new Error(`Missing route ${method} ${path}`);
  return [...layers.filter((entry) => !entry.route).map((entry) => entry.handle), ...layer.route.stack.map((entry) => entry.handle)];
};
const request = (permissions: string[], body: unknown = {}, params: Record<string, string> = {}, role = "Technician") =>
  ({ params: { id, ...params }, query: {}, body, user: { userId: "actor", role, permissions, branchId: "home" } }) as unknown as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};
const findUnique = prisma.jobCard.findUnique as jest.Mock;

beforeEach(() => findUnique.mockReset());

it("needs job card read to view diagnosis and job card update to change findings", () => {
  const [readPermission] = routeStack(jobDiagnosisRoutes, "/", "get");
  expect(() => readPermission(request([]), response(), jest.fn())).toThrow("required permissions");
  for (const [path, method] of [
    ["/findings/:findingId", "put"],
    ["/findings/:findingId", "delete"],
    ["/findings/:findingId/photos", "post"],
    ["/findings/:findingId/photos/:photoId", "delete"],
  ] as const) {
    const [, , updatePermission] = routeStack(jobDiagnosisRoutes, path, method);
    expect(() => updatePermission(request([PERMISSIONS.JOBCARD_READ]), response(), jest.fn())).toThrow("required permissions");
  }
});

it("returns 404 for a missing job and 403 for another branch", async () => {
  const [, branchAccess] = routeStack(jobDiagnosisRoutes, "/", "get");
  const next: jest.MockedFunction<NextFunction> = jest.fn();
  findUnique.mockResolvedValueOnce(null);
  await branchAccess(request([PERMISSIONS.JOBCARD_READ]), response(), next);
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: "Job card not found" });
  findUnique.mockResolvedValueOnce({ branchId: "other" });
  await branchAccess(request([PERMISSIONS.JOBCARD_READ]), response(), next);
  expect(next.mock.calls[1][0]).toMatchObject({ statusCode: 403 });
  findUnique.mockResolvedValueOnce({ branchId: "home" });
  await branchAccess(request([PERMISSIONS.JOBCARD_READ]), response(), next);
  expect(next).toHaveBeenLastCalledWith();
});

it("rejects a bad finding naming the field and the fix, and saves a good one", async () => {
  const stack = routeStack(jobDiagnosisRoutes, "/findings/:findingId", "put");
  const body = { complaintId: null, causeAndDefect: "Wiper blade torn", possibleWarranty: false, items: [{ kind: "PART", referenceId: findingId, quantity: -1 }], expectedVersion: 0 };
  const bad = response();
  await stack[3](request([PERMISSIONS.JOBCARD_UPDATE], body, { findingId }), bad, jest.fn());
  expect(bad.status).toHaveBeenCalledWith(400);
  expect(bad.json.mock.calls[0][0].errors).toEqual([expect.objectContaining({ field: "items.0.quantity", message: "Enter a quantity above 0" })]);

  const good = response();
  const next = jest.fn();
  const req = request([PERMISSIONS.JOBCARD_UPDATE], { ...body, items: [] }, { findingId });
  await stack[3](req, good, next);
  expect(next).toHaveBeenCalledWith();
  await stack[4](req, good, jest.fn());
  expect(saveFinding).toHaveBeenCalledWith(id, findingId, expect.objectContaining({ causeAndDefect: "Wiper blade torn" }), { id: "actor", role: "Technician" });
  expect(good.json).toHaveBeenCalledWith(expect.objectContaining({ status: "success", message: "Finding saved" }));
});
