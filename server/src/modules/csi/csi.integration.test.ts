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
          permission === PERMISSIONS.CSI_MASTER_UPDATE ||
          permission === PERMISSIONS.CSI_CARD_GENERATE ||
          permission === PERMISSIONS.CSI_RESPONSE_READ ||
          permission === PERMISSIONS.CSI_RESPONSE_UPDATE ||
          permission === PERMISSIONS.CSI_REPORT ||
          permission === PERMISSIONS.CSI_ATTRIBUTE_REPORT ||
          permission === PERMISSIONS.CSI_CHECKLIST_REPORT,
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
      "/reports",
      (require("../reports/framework.routes") as typeof import("../reports/framework.routes")).default,
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

    const customer = await db.customer.create({
      data: { branchId, firstName: "CSI", lastName: "Issuance fixture" },
    });
    const vehicle = await db.vehicle.create({
      data: {
        vin: "CSI-" + run,
        customMake: "CSI fixture make",
        customModel: "CSI fixture model",
        customerId: customer.id,
        registrationNumber: "CSI-" + run,
      },
    });
    const serviceType = await db.workshopMaster.create({
      data: {
        kind: "SERVICE_TYPE",
        code: "CSI-" + run,
        description: "CSI issuance fixture",
        category: "PAID",
      },
    });
    const delivered = await db.jobCard.create({
      data: {
        branchId,
        jobNumber: "CSI-" + run,
        description: "CSI issuance fixture",
        customerId: customer.id,
        vehicleId: vehicle.id,
        serviceTypeId: serviceType.id,
        status: "DELIVERED",
        createdAt: new Date("2026-12-01"),
        deliveredAt: new Date("2026-12-02"),
      },
    });
    const body = { jobCardIds: [delivered.id] };
    expect((await call("/surveys/generate", reader, "POST", body)).status).toBe(
      403,
    );
    expect(
      (await call("/surveys/generate", outsider, "POST", body)).status,
    ).toBe(404);
    const generated = await Promise.all([
      call("/surveys/generate", manager, "POST", body),
      call("/surveys/generate", manager, "POST", body),
    ]);
    expect(generated.map((row) => row.status)).toEqual([201, 201]);
    const issued = await db.csiSurvey.findMany({
      where: { jobCardId: delivered.id },
    });
    expect(issued).toHaveLength(1);
    expect(issued[0].jobSnapshot).toMatchObject({
      customer: "CSI Issuance fixture",
      registration: "CSI-" + run,
    });
    const originalRevisionId = issued[0].revisionId;
    await db.customer.update({
      where: { id: customer.id },
      data: { lastName: "Changed later" },
    });
    await db.csiCard.update({
      where: { id: saved.id },
      data: { active: false },
    });
    expect(
      (await call("/surveys/generate", manager, "POST", body)).status,
    ).toBe(201);
    const persisted = await db.csiSurvey.findUniqueOrThrow({
      where: { jobCardId: delivered.id },
    });
    expect(persisted.revisionId).toBe(originalRevisionId);
    expect(persisted.jobSnapshot).toMatchObject({
      customer: "CSI Issuance fixture",
    });
    expect(
      (
        await call("/surveys/print", outsider, "POST", {
          surveyIds: [persisted.id],
        })
      ).status,
    ).toBe(404);
    const printable = await call("/surveys/print", manager, "POST", {
      surveyIds: [persisted.id],
    });
    expect(printable.status).toBe(200);
    const printed = (await printable.json()) as {
      data: {
        surveys: {
          revision: { attributes: { description: string }[] };
          jobSnapshot: { customer: string };
        }[];
      };
    };
    expect(printed.data.surveys[0].revision.attributes[0].description).toBe(
      attribute.description,
    );
    expect(printed.data.surveys[0].jobSnapshot.customer).toBe(
      "CSI Issuance fixture",
    );
    const { lagosDay } =
      require("../finance/credit-terms") as typeof import("../finance/credit-terms");
    const responseInput = {
      version: 0,
      responseDate: lagosDay(new Date()),
      comments: "Synthetic customer feedback",
      answers: [{ attributeId: a.id, responseId: r1.id }],
    };
    expect(
      (await call("/surveys/issued/" + persisted.id, outsider)).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/surveys/issued/" + persisted.id + "/responses",
          reader,
          "PATCH",
          responseInput,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/surveys/issued/" + persisted.id + "/responses",
          manager,
          "PATCH",
          responseInput,
        )
      ).status,
    ).toBe(200);
    const completed = await db.csiSurvey.findUniqueOrThrow({
      where: { id: persisted.id },
      include: { answers: true },
    });
    expect(completed.status).toBe("RESPONDED");
    expect(completed.score?.toString()).toBe("4");
    expect(completed.scorePercent?.toString()).toBe("100");
    expect(completed.answers[0].attributeDescription).toBe(
      attribute.description,
    );
    const corrections = await Promise.all([
      call("/surveys/issued/" + persisted.id + "/responses", manager, "PATCH", {
        ...responseInput,
        version: 1,
      }),
      call("/surveys/issued/" + persisted.id + "/responses", manager, "PATCH", {
        ...responseInput,
        version: 1,
        answers: [{ attributeId: a.id, responseId: r2.id }],
      }),
    ]);
    expect(corrections.map((result) => result.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      await db.auditLog.count({
        where: { userId, action: "CSI_RESPONSE_CORRECTED" },
      }),
    ).toBe(1);
    const latest = await db.csiSurvey.findUniqueOrThrow({ where: { id: persisted.id }, include: { answers: true } });
    const reportsBase = base.replace(/\/csi$/, '/reports');
    const reportRequest = (path: string, token = manager) => fetch(reportsBase + path, { headers: { Authorization: 'Bearer ' + token } });
    const summaryResult = await reportRequest('/csi?withFormula=true');
    expect(summaryResult.status).toBe(200);
    const summary = await summaryResult.json() as { data: { rows: { score: number; percentage: number }[]; totals: { surveys: number; averageScore: number; averagePercent: number }; sections: { rows: { attribute: string; weightedMarks: string }[] }[] } };
    expect(summary.data.rows).toHaveLength(1);
    expect(summary.data.totals).toMatchObject({ surveys: 1, averageScore: latest.score!.toNumber(), averagePercent: latest.scorePercent!.toNumber() });
    expect(summary.data.sections[0].rows[0].attribute).toBe(attribute.description);
    expect(summary.data.sections[0].rows[0].weightedMarks).toBe(latest.score!.toFixed(6));
    const analysisResult = await reportRequest('/csi-attribute?attributeId=' + a.id);
    expect(analysisResult.status).toBe(200);
    const analysis = await analysisResult.json() as { data: { rows: { count: number; percentage: number }[] } };
    expect(analysis.data.rows).toHaveLength(2);
    expect(analysis.data.rows.reduce((sum, row) => sum + row.count, 0)).toBe(1);
    expect(analysis.data.rows.reduce((sum, row) => sum + row.percentage, 0)).toBe(100);
    const checklistResult = await reportRequest('/csi-checklist?attributeId=' + a.id + '&responseId=' + latest.answers[0].responseId);
    expect(checklistResult.status).toBe(200);
    const checklist = await checklistResult.json() as { data: { rows: { customer: string; attribute: string }[] } };
    expect(checklist.data.rows).toHaveLength(1);
    expect(checklist.data.rows[0]).toMatchObject({ customer: 'CSI Issuance fixture', attribute: attribute.description });
    expect((await reportRequest('/csi?branchId=' + otherId)).status).toBe(403);
    const historicalOptions = await reportRequest('/lookups/csiAttribute');
    expect(historicalOptions.status).toBe(200);
    const options = await historicalOptions.json() as { data: { id: string; active: boolean }[] };
    expect(options.data).toContainEqual(expect.objectContaining({ id: a.id, active: false }));
    expect(options.data.some(option => option.id === b.id)).toBe(false);
    const foreignReport = await reportRequest('/csi', outsider);
    expect(foreignReport.status).toBe(200);
    expect((await foreignReport.json() as { data: { rows: unknown[] } }).data.rows).toHaveLength(0);
    await db.jobCard.update({
      where: { id: delivered.id },
      data: { status: "READY", deliveredAt: null },
    });
    expect(
      (await call("/surveys/generate", manager, "POST", body)).status,
    ).toBe(400);
  });
});
