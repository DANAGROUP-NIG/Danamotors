jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: { jobCard: { findUnique: jest.fn() } },
}));
const saveDecisions = jest.fn().mockResolvedValue({ editable: true });
const get = jest.fn().mockResolvedValue({ editable: false });
jest.mock("./job-warranty.service", () => ({
  JobWarrantyService: jest.fn().mockImplementation(() => ({
    get,
    saveDecisions,
    addOutsideRecord: jest.fn(),
    removeOutsideRecord: jest.fn(),
  })),
}));
import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import prisma from "../../prisma/client";
import { jobWarrantyRoutes } from "./job-warranty.routes";
import { PERMISSIONS } from "../../shared/constants/roles";

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] }; handle: RequestHandler };
const id = "11111111-1111-4111-8111-111111111111";
const itemId = "33333333-3333-4333-8333-333333333333";
const routeStack = (router: Router, path: string, method: "get" | "put" | "post" | "delete") => {
  const layers = router.stack as unknown as Layer[];
  const layer = layers.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) throw new Error(`Missing route ${method} ${path}`);
  return [...layers.filter((entry) => !entry.route).map((entry) => entry.handle), ...layer.route.stack.map((entry) => entry.handle)];
};
const request = (permissions: string[], body: unknown = {}, params: Record<string, string> = {}, role = "WarrantyOfficer") =>
  ({ params: { id, ...params }, query: {}, body, user: { userId: "actor", role, permissions, branchId: "home" } }) as unknown as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};
const findUnique = prisma.jobCard.findUnique as jest.Mock;
const WARRANTY_STAFF = [PERMISSIONS.JOBCARD_READ, PERMISSIONS.JOBCARD_UPDATE, PERMISSIONS.WARRANTY_READ, PERMISSIONS.WARRANTY_UPDATE];

beforeEach(() => findUnique.mockReset());

it("needs warranty read to view the check, so a technician is refused", () => {
  const [jobRead, warrantyRead] = routeStack(jobWarrantyRoutes, "/", "get");
  const technician = request([PERMISSIONS.JOBCARD_READ, PERMISSIONS.JOBCARD_UPDATE], {}, {}, "Technician");
  expect(() => jobRead(technician, response(), jest.fn())).not.toThrow();
  expect(() => warrantyRead(technician, response(), jest.fn())).toThrow("required permissions");
});

it("needs job card update and warranty update to decide, and warranty update for outside records", () => {
  const [, , , jobUpdate, warrantyUpdate] = routeStack(jobWarrantyRoutes, "/", "put");
  expect(() => jobUpdate(request([PERMISSIONS.WARRANTY_UPDATE]), response(), jest.fn())).toThrow("required permissions");
  expect(() => warrantyUpdate(request([PERMISSIONS.JOBCARD_UPDATE]), response(), jest.fn())).toThrow("required permissions");
  for (const [path, method] of [
    ["/outside-services", "post"],
    ["/outside-services/:recordId", "delete"],
  ] as const) {
    const [, , , permission] = routeStack(jobWarrantyRoutes, path, method);
    expect(() => permission(request([PERMISSIONS.WARRANTY_READ]), response(), jest.fn())).toThrow("required permissions");
  }
});

it("returns 404 for a missing job and 403 for another branch", async () => {
  const [, , branchAccess] = routeStack(jobWarrantyRoutes, "/", "get");
  const next: jest.MockedFunction<NextFunction> = jest.fn();
  findUnique.mockResolvedValueOnce(null);
  await branchAccess(request(WARRANTY_STAFF), response(), next);
  expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404, message: "Job card not found" });
  findUnique.mockResolvedValueOnce({ branchId: "other" });
  await branchAccess(request(WARRANTY_STAFF), response(), next);
  expect(next.mock.calls[1][0]).toMatchObject({ statusCode: 403 });
});

it("rejects a bad decision naming the field, and saves a good one with the person's access", async () => {
  const stack = routeStack(jobWarrantyRoutes, "/", "put");
  const bad = response();
  await stack[5](request(WARRANTY_STAFF, { items: [{ itemId, payer: "SOMEONE" }] }), bad, jest.fn());
  expect(bad.status).toHaveBeenCalledWith(400);
  expect(bad.json.mock.calls[0][0].errors).toEqual([expect.objectContaining({ field: "items.0.payer", message: "Choose Warranty, Goodwill, Campaign or Customer pay" })]);

  const good = response();
  const req = request(WARRANTY_STAFF, { items: [{ itemId, payer: "WARRANTY" }], reason: "Not related to the missed service" });
  const next = jest.fn();
  await stack[5](req, good, next);
  expect(next).toHaveBeenCalledWith();
  await stack[6](req, good, jest.fn());
  expect(saveDecisions).toHaveBeenCalledWith(id, expect.objectContaining({ reason: "Not related to the missed service" }), { id: "actor", role: "WarrantyOfficer" }, { canUpdate: true, canDecide: true });
  expect(good.json).toHaveBeenCalledWith(expect.objectContaining({ status: "success", message: "Decisions saved" }));
});

it("tells the service who may decide: a read-only advisor gets canDecide false", async () => {
  const stack = routeStack(jobWarrantyRoutes, "/", "get");
  await stack[4](request([PERMISSIONS.JOBCARD_READ, PERMISSIONS.JOBCARD_UPDATE, PERMISSIONS.WARRANTY_READ], {}, {}, "ServiceAdvisor"), response(), jest.fn());
  expect(get).toHaveBeenLastCalledWith(id, { id: "actor", role: "ServiceAdvisor" }, { canUpdate: true, canDecide: false });
});
