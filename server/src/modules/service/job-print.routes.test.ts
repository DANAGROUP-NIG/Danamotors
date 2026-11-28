jest.mock("../../prisma/client", () => ({ __esModule: true, default: { jobCard: { findUnique: jest.fn() } } }));
jest.mock("./job-print.service", () => ({
  JobPrintService: jest.fn().mockImplementation(() => ({
    jobCard: jest.fn().mockResolvedValue({ job: { number: "2026000127" } }),
    gatePass: jest.fn().mockResolvedValue({ gatePassNumber: "GP-2026-001234" }),
  })),
}));
import express, { type Request } from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import prisma from "../../prisma/client";
import { PERMISSIONS } from "../../shared/constants/roles";
import { errorHandler } from "../../middleware/errorHandler";
import { jobPrintRoutes } from "./job-print.routes";

const home = "11111111-1111-4111-8111-111111111111";
const other = "33333333-3333-4333-8333-333333333333";
const jobId = "22222222-2222-4222-8222-222222222222";
const findJob = prisma.jobCard.findUnique as jest.Mock;

let server: Server;
let base = "";
let user: { userId: string; role: string; permissions: string[]; branchId: string | null };

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.user = user as Request["user"];
    next();
  });
  app.use("/job-cards/:id/print", jobPrintRoutes);
  app.use(errorHandler);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  user = { userId: "actor", role: "ServiceAdviser", permissions: [PERMISSIONS.JOBCARD_READ, PERMISSIONS.ESTIMATE_PRINT], branchId: home };
  findJob.mockResolvedValue({ branchId: home });
});

const get = (path: string) => fetch(`${base}/job-cards/${path}`);
const body = async (res: Response) => (await res.json()) as { data?: unknown; message?: string };

it("prints the job card for its own branch with the print permission, never cached", async () => {
  const res = await get(`${jobId}/print`);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  expect((await body(res)).data).toEqual({ job: { number: "2026000127" } });
});

it("needs estimate print for the job card, but job card read is enough for the gate pass", async () => {
  user.permissions = [PERMISSIONS.JOBCARD_READ];
  expect((await get(`${jobId}/print`)).status).toBe(403);
  const pass = await get(`${jobId}/print/gate-pass`);
  expect(pass.status).toBe(200);
  expect((await body(pass)).data).toEqual({ gatePassNumber: "GP-2026-001234" });
});

it("refuses without job card read, for another branch, for a missing job and for a bad ID", async () => {
  user.permissions = [PERMISSIONS.ESTIMATE_PRINT];
  expect((await get(`${jobId}/print`)).status).toBe(403);
  user.permissions = [PERMISSIONS.JOBCARD_READ, PERMISSIONS.ESTIMATE_PRINT];
  findJob.mockResolvedValueOnce({ branchId: other });
  expect((await get(`${jobId}/print/gate-pass`)).status).toBe(403);
  findJob.mockResolvedValueOnce(null);
  const missing = await get(`${jobId}/print`);
  expect(missing.status).toBe(404);
  expect((await body(missing)).message).toBe("Job card not found");
  const bad = await get("not-a-job/print");
  expect(bad.status).toBe(400);
});
