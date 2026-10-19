import type { Request, Response } from "express";
import { errorHandler } from "./errorHandler";

function respond(err: Error) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  errorHandler(err, {} as Request, res, jest.fn());
  return { status: (res.status as jest.Mock).mock.calls[0][0], body: (res.json as jest.Mock).mock.calls[0][0] };
}

describe("errorHandler", () => {
  it("turns the annual stock taking freeze raised by the database into a 409", () => {
    // As Prisma reports a trigger exception: the database message is buried in the error text.
    const err = new Error(
      'Invalid `prisma.inventoryStock.upsert()` invocation: Error occurred during query execution: ConnectorError(ConnectorError { kind: QueryError(PostgresError { code: "P0001", message: "STOCK_TAKE_FREEZE: Part 1244106207B is under annual stock taking (batch 2026000006). Its stock cannot move at this branch until the count is completed.", severity: "ERROR" }) })',
    );
    const { status, body } = respond(err);
    expect(status).toBe(409);
    expect(body).toMatchObject({
      code: "STOCK_TAKE_FREEZE",
      message: "Part 1244106207B is under annual stock taking (batch 2026000006). Its stock cannot move at this branch until the count is completed.",
    });
  });
});
