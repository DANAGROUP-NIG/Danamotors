jest.mock("../../prisma/client", () => ({
  __esModule: true,
  default: { jobCard: { findUnique: jest.fn() } },
}));
jest.mock("./job-check-in.service", () => ({
  JobCheckInService: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue({ editable: true }),
    saveDetails: jest.fn().mockResolvedValue({ editable: true }),
    saveWalkAround: jest.fn().mockResolvedValue({ version: 2 }),
    addDamageMark: jest.fn(),
    removeDamageMark: jest.fn(),
    addPhoto: jest.fn(),
    removePhoto: jest.fn(),
    readPhoto: jest.fn().mockResolvedValue({ data: Buffer.from("img"), contentType: "image/jpeg", sha256: "a".repeat(64) }),
  })),
}));
import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import prisma from "../../prisma/client";
import { jobCheckInRoutes, jobPhotoRoutes } from "./job-check-in.routes";
import { PERMISSIONS } from "../../shared/constants/roles";

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] }; handle: RequestHandler };
const id = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const routeStack = (router: Router, path: string, method: "get" | "put" | "post" | "delete") => {
  const layers = router.stack as unknown as Layer[];
  const layer = layers.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer?.route) throw new Error(`Missing route ${method} ${path}`);
  // Router-level middleware (read permission, branch access) runs first.
  return [...layers.filter((entry) => !entry.route).map((entry) => entry.handle), ...layer.route.stack.map((entry) => entry.handle)];
};
const request = (permissions: string[], body: unknown = {}, params: Record<string, string> = {}) =>
  ({ params: { id, ...params }, query: {}, body, user: { userId: "actor", role: "ServiceAdviser", permissions, branchId: "home" } }) as unknown as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn(), set: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock; set: jest.Mock; send: jest.Mock };
};
const findUnique = prisma.jobCard.findUnique as jest.Mock;

beforeEach(() => findUnique.mockReset());

it("needs job card read to view check-in and job card update to change it", () => {
  const [readPermission] = routeStack(jobCheckInRoutes, "/", "get");
  expect(() => readPermission(request([]), response(), jest.fn())).toThrow("required permissions");
  const [, , updatePermission] = routeStack(jobCheckInRoutes, "/walk-around", "put");
  expect(() => updatePermission(request([PERMISSIONS.JOBCARD_READ]), response(), jest.fn())).toThrow("required permissions");
  const [, , photoPermission] = routeStack(jobPhotoRoutes, "/", "post");
  expect(() => photoPermission(request([PERMISSIONS.JOBCARD_READ]), response(), jest.fn())).toThrow("required permissions");
});

it("returns 404 for a missing job and 403 for another branch", async () => {
  const [, branchAccess] = routeStack(jobCheckInRoutes, "/", "get");
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

it("rejects bad input naming the field and the fix", async () => {
  const validation = async (path: string, method: "put" | "post", body: unknown, router: Router = jobCheckInRoutes) => {
    const validate = routeStack(router, path, method)[3];
    const res = response();
    await validate(request([PERMISSIONS.JOBCARD_UPDATE], body), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    return res.json.mock.calls[0][0].errors as { field: string; message: string }[];
  };
  expect(await validation("/damage-marks", "post", { requestId, type: "DENT", x: 120, y: 10 })).toEqual([
    expect.objectContaining({ field: "x", message: "Place the mark on the car diagram" }),
  ]);
  expect(
    await validation("/walk-around", "put", {
      expectedVersion: 0,
      fuelLevel: "HALF",
      checklist: { SUNROOF: "PRESENT" },
      serviceBookSeen: false,
      serviceBookStamps: null,
      noValuables: false,
    }),
  ).toEqual([expect.objectContaining({ message: "The checklist has an item that is not on the job card. Reload the page and try again." })]);
  expect(await validation("/", "post", { requestId, category: "CHECK_IN", slot: "ROOF", image: "data:image/png;base64,AA==" }, jobPhotoRoutes)).toEqual([
    expect.objectContaining({ field: "slot", message: "Choose Front, Rear, Left, Right or Odometer" }),
  ]);
});

it("serves a photo with its content type and no sniffing, without JSON", async () => {
  const handler = routeStack(jobPhotoRoutes, "/:photoId", "get").at(-1)!;
  const res = response();
  await handler(request([PERMISSIONS.JOBCARD_READ], {}, { photoId: requestId }), res, jest.fn());
  expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff" }));
  expect(res.send).toHaveBeenCalledWith(Buffer.from("img"));
  expect(res.json).not.toHaveBeenCalled();
});
