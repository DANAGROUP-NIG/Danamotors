import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import express from "express";
import jwt from "jsonwebtoken";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from "../../shared/constants/roles";

const database = process.env.TEST_DATABASE_URL;
const describeDb = database ? describe : describe.skip;

describeDb("CSI masters API on isolated local PostgreSQL", () => {
  let db: PrismaClient;
  let server: Server;
  let base: string;
  let manager: string;
  let reader: string;
  let outsider: string;
  let branchId: string;
  let otherId: string;
  let userId: string;
  const run = randomUUID();

  beforeAll(async () => {
    if (
      !database ||
      !["127.0.0.1", "localhost", "[::1]"].includes(new URL(database).hostname)
    )
      throw new Error(
        "CSI integration tests require a disposable localhost database",
      );
    process.env.DATABASE_URL = database;
    process.env.JWT_SECRET = randomUUID();
    process.env.JWT_REFRESH_SECRET = randomUUID();
    db = (
      require("../../prisma/client") as typeof import("../../prisma/client")
    ).default;
    const role = async (name: string, permissions: string[]) =>
      db.role.create({
        data: {
          name: name + run,
          permissions: {
            create: permissions.map((permission) => ({
              permission: {
                connectOrCreate: {
                  where: { name: permission },
                  create: { name: permission },
                },
              },
            })),
          },
        },
      });
    const grant = (roleName: keyof typeof ROLE_PERMISSIONS) =>
      ROLE_PERMISSIONS[roleName].filter(
        (permission) =>
          permission === PERMISSIONS.CSI_MASTER_READ ||
          permission === PERMISSIONS.CSI_MASTER_UPDATE,
      );
    const managerRole = await role(
      "service manager",
      grant(ROLES.SERVICE_MANAGER),
    );
    const readerRole = await role(
      "workshop manager",
      grant(ROLES.WORKSHOP_MANAGER),
    );
    const branch = await db.branch.create({
      data: { name: "CSI workshop " + run },
    });
    const other = await db.branch.create({
      data: { name: "CSI other workshop " + run },
    });
    branchId = branch.id;
    otherId = other.id;
    const user = async (name: string, roleId: string, staffBranch: string) =>
      db.user.create({
        data: {
          email: name + run + "@example.invalid",
          firstName: "CSI",
          lastName: "Fixture",
          passwordHash: randomUUID(),
          roleId,
          branchId: staffBranch,
        },
      });
    const managerUser = await user("manager", managerRole.id, branchId);
    userId = managerUser.id;
    const token = (id: string) =>
      jwt.sign({ userId: id }, process.env.JWT_SECRET!);
    manager = token(userId);
    reader = token((await user("reader", readerRole.id, branchId)).id);
    outsider = token((await user("outsider", managerRole.id, otherId)).id);

    const app = express();
    app.use(express.json());
    app.use(
      "/csi",
      (require("./csi.routes") as typeof import("./csi.routes")).default,
    );
    app.use(
      (
        require("../../middleware/errorHandler") as typeof import("../../middleware/errorHandler")
      ).errorHandler,
    );
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("CSI test API is not listening on TCP");
    base = "http://127.0.0.1:" + address.port + "/csi";
  }, 30000);

  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await db?.$disconnect();
  });

  function call(path: string, token?: string, method = "GET", body?: object) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  test("enforces role and branch isolation, preserves snapshots, and rejects stale writes", async () => {
    const attribute = {
      code: "a1",
      description: "Réception à Lagos",
      shortDescription: "Reception",
      active: true,
      weightage: "1",
    };
    const excellent = {
      code: "01",
      description: "Excellent",
      active: true,
      marks: "5",
    };
    const poor = { code: "05", description: "Poor", active: true, marks: "1" };
    expect((await call("/attributes")).status).toBe(401);
    expect((await call("/attributes", reader, "POST", attribute)).status).toBe(
      403,
    );
    expect(
      (await call("/attributes?branchId=" + branchId, outsider)).status,
    ).toBe(403);

    const insert = async (
      path: string,
      body: object,
      actor = manager,
    ): Promise<{ id: string }> => {
      const response = await call(path, actor, "POST", body);
      const json = (await response.json()) as {
        message?: string;
        data: { id: string };
      };
      expect({ status: response.status, message: json.message }).toEqual({
        status: 201,
        message: undefined,
      });
      return json.data;
    };
    const a = await insert("/attributes", attribute);
    const b = await insert("/attributes", attribute, outsider);
    expect(b.id).not.toBe(a.id);
    expect((await call("/attributes", manager, "POST", attribute)).status).toBe(
      409,
    );
    const list = (await (await call("/attributes", reader)).json()) as {
      data: { items: unknown[] };
    };
    expect(list.data.items).toEqual([
      expect.objectContaining({
        id: a.id,
        code: "A1",
        description: attribute.description,
      }),
    ]);
    expect(
      (await call("/attributes/" + b.id, manager, "PATCH", attribute)).status,
    ).toBe(404);
    const r1 = await insert("/responses", excellent);
    const r2 = await insert("/responses", poor);
    const card = {
      code: "C1",
      description: "Service questionnaire",
      active: true,
      cardDate: "2026-11-23",
      effectiveDate: "2026-11-30",
      appliesTo: "NON_ACCIDENTAL",
      attributes: [{ attributeId: a.id, weightage: "1" }],
      responses: [
        { responseId: r1.id, marks: "5" },
        { responseId: r2.id, marks: "1" },
      ],
    };
    expect(
      (
        await call("/cards", manager, "POST", {
          ...card,
          attributes: [{ attributeId: b.id, weightage: "1" }],
        })
      ).status,
    ).toBe(400);
    const saved = await insert("/cards", card);
    expect(
      (
        await call("/attributes/" + a.id, manager, "PATCH", {
          ...attribute,
          active: false,
          description: "Updated name",
        })
      ).status,
    ).toBe(200);
    await expect(
      db.csiAttribute.delete({ where: { id: a.id } }),
    ).rejects.toThrow("CsiCardAttribute_branchId_attributeId_fkey");
    await expect(
      db.csiResponse.delete({ where: { id: r1.id } }),
    ).rejects.toThrow("CsiCardResponse_branchId_responseId_fkey");

    const edit = {
      ...card,
      code: "C2",
      version: 1,
      responses: [{ responseId: r1.id, marks: "4" }, card.responses[1]],
    };
    const results = await Promise.all([
      call("/cards/" + saved.id, manager, "PATCH", edit),
      call("/cards/" + saved.id, manager, "PATCH", edit),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const revisions = await db.csiCardRevision.findMany({
      where: { cardId: saved.id },
      orderBy: { version: "asc" },
      include: {
        attributes: true,
        responses: { orderBy: { sequence: "asc" } },
      },
    });
    expect(
      revisions.map((row) => [
        row.code,
        row.attributes[0].description,
        row.responses[0].marks.toString(),
      ]),
    ).toEqual([
      ["C1", attribute.description, "5"],
      ["C2", attribute.description, "4"],
    ]);
    expect(
      await db.auditLog.count({
        where: { userId, action: "CSI_MASTER_UPDATED" },
      }),
    ).toBe(2);
  });
});
