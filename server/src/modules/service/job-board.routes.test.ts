jest.mock("../../prisma/client", () => ({ __esModule: true, default: { jobCard: { findUnique: jest.fn() } } }));
jest.mock("./job-board.service", () => ({ loadWorkshopBoard: jest.fn().mockResolvedValue({ columns: [] }) }));
import type { Request, RequestHandler, Response } from "express";
import router from "./service.routes";
import { loadWorkshopBoard } from "./job-board.service";
import { PERMISSIONS } from "../../shared/constants/roles";

type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
const home = "11111111-1111-4111-8111-111111111111";
const other = "33333333-3333-4333-8333-333333333333";
const layers = () => router.stack as Layer[];
const stack = () => {
  const layer = layers().find((entry) => entry.route?.path === "/job-cards/board" && entry.route.methods.get);
  if (!layer?.route) throw new Error("Missing route get /job-cards/board");
  return layer.route.stack.map((entry) => entry.handle);
};
const request = (query: Record<string, string>, user: Partial<{ role: string; permissions: string[]; branchId: string | null }> = {}) =>
  ({
    query,
    params: {},
    body: {},
    user: { userId: "actor", role: "WorkshopManager", permissions: [PERMISSIONS.JOBCARD_READ], branchId: home, ...user },
  }) as unknown as Request;
const response = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};
const load = loadWorkshopBoard as jest.Mock;

beforeEach(() => load.mockClear());

it("is registered before /job-cards/:id so the word board is never read as a job ID", () => {
  const paths = layers().flatMap((entry) => (entry.route?.methods.get ? [entry.route.path] : []));
  expect(paths.indexOf("/job-cards/board")).toBeGreaterThanOrEqual(0);
  expect(paths.indexOf("/job-cards/board")).toBeLessThan(paths.indexOf("/job-cards/:id"));
});

it("needs job card read", () => {
  const [permission] = stack();
  expect(() => permission(request({}, { permissions: [] }), response(), jest.fn())).toThrow("required permissions");
});

it("names the field in a bad filter", async () => {
  const [, validate] = stack();
  const res = response();
  await validate(request({ technicianId: "musa", date: "27/11/2026" }), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json.mock.calls[0][0].errors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ message: "Choose a technician from the list" }),
      expect.objectContaining({ message: "Enter the received date as YYYY-MM-DD" }),
    ]),
  );
});

it("uses the user's own branch, refuses another branch and asks for a branch when there is none", async () => {
  const handler = stack().at(-1)!;
  const next = jest.fn();
  await handler(request({}), response(), next);
  expect(load).toHaveBeenCalledWith(expect.objectContaining({ branchId: home }));

  await handler(request({ branchId: other }), response(), next);
  expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 403 }));
  expect(load).toHaveBeenCalledTimes(1);

  await handler(request({}, { role: "SuperAdmin", branchId: null }), response(), next);
  expect(next).toHaveBeenLastCalledWith(expect.objectContaining({ statusCode: 400, message: "Choose a branch to see its workshop board" }));

  await handler(request({ branchId: other, advisorId: home }, { role: "SuperAdmin", branchId: null }), response(), next);
  expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ branchId: other, advisorId: home }));
});
