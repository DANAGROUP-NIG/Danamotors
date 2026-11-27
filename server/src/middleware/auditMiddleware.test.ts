import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import prisma from "../prisma/client";
import { auditMiddleware } from "./auditMiddleware";

jest.mock("../prisma/client", () => ({
  __esModule: true,
  default: { auditLog: { create: jest.fn().mockResolvedValue(undefined) } },
}));

it("redacts both identifiers from nested booking audit details", () => {
  const req = {
    method: "POST",
    originalUrl: "/api/services/appointments",
    headers: {},
    user: { userId: "synthetic-user" },
    body: { customerDetails: { tin: "TEST-TIN", nin: "00000000001", postalCode: "100001" } },
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), { statusCode: 201 });
  const next = jest.fn();
  auditMiddleware(req, res as unknown as Response, next);
  res.emit("finish");
  expect(next).toHaveBeenCalledTimes(1);
  expect(prisma.auditLog.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      details: JSON.stringify({ customerDetails: { tin: "[REDACTED]", nin: "[REDACTED]", postalCode: "100001" } }),
    }),
  });
});
