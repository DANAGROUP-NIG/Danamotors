import type { Request, Response } from "express";
import { requirePermission } from "../../middleware/authorize";
import {
  PERMISSIONS as P,
  ROLE_PERMISSIONS,
  ROLES as R,
  type RoleType,
} from "./roles";
import type { PrismaClient } from "@prisma/client";
const seedRoles = (
  require("../../../prisma/seed/roles") as {
    default: (client: PrismaClient) => Promise<void>;
  }
).default;

const all: string[] = [
  P.CSI_MASTER_READ,
  P.CSI_MASTER_UPDATE,
  P.CSI_CARD_GENERATE,
  P.CSI_RESPONSE_READ,
  P.CSI_RESPONSE_UPDATE,
  P.CSI_REPORT,
  P.CSI_ATTRIBUTE_REPORT,
  P.CSI_CHECKLIST_REPORT,
];
const read = [
  P.CSI_MASTER_READ,
  P.CSI_RESPONSE_READ,
  P.CSI_REPORT,
  P.CSI_ATTRIBUTE_REPORT,
  P.CSI_CHECKLIST_REPORT,
];
const operate = [
  P.CSI_CARD_GENERATE,
  P.CSI_RESPONSE_READ,
  P.CSI_RESPONSE_UPDATE,
];
const expected = new Map<RoleType, string[]>([
  [R.SUPER_ADMIN, all],
  [R.ADMIN, all],
  [R.SERVICE_MANAGER, all],
  [R.WORKSHOP_MANAGER, read],
  [R.AUDITOR, read],
  [R.CCU_MANAGER, operate],
  [R.CCU_OFFICER, operate],
]);

describe.each(Object.values(R))("%s CSI permissions", (role) => {
  it("enforces the intended CSI access without granting other roles survey access", () => {
    const assigned: string[] = ROLE_PERMISSIONS[role].filter((permission) =>
      all.includes(permission),
    );
    expect([...assigned].sort()).toEqual(
      [...(expected.get(role) ?? [])].sort(),
    );
    expect(new Set(assigned).size).toBe(assigned.length);
    for (const permission of all) {
      const request = {
        user: { role, permissions: ROLE_PERMISSIONS[role] },
      } as unknown as Request;
      const execute = () =>
        requirePermission(permission)(request, {} as Response, jest.fn());
      if (assigned.includes(permission)) expect(execute).not.toThrow();
      else expect(execute).toThrow();
    }
  });
});

it("repeated role seeding restores the same CSI grants from ROLE_PERMISSIONS", async () => {
  const saved = new Map<string, string[]>();
  const db = {
    permission: {
      upsert: jest.fn(),
      findMany: jest.fn(
        async ({ where }: { where: { name: { in: string[] } } }) =>
          [...new Set(where.name.in)].map((name) => ({ id: name })),
      ),
    },
    role: {
      upsert: jest.fn(async ({ where }: { where: { name: string } }) => ({
        id: where.name,
      })),
    },
    rolePermission: {
      deleteMany: jest.fn(async ({ where }: { where: { roleId: string } }) => {
        saved.set(where.roleId, []);
      }),
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: { roleId: string; permissionId: string }[];
        }) => {
          for (const item of data)
            saved.get(item.roleId)!.push(item.permissionId);
        },
      ),
    },
  };
  const log = jest.spyOn(console, "log").mockImplementation(() => {});
  try {
    await seedRoles(db as unknown as Parameters<typeof seedRoles>[0]);
    const initial = JSON.stringify([...saved]);
    saved.set(R.ADMIN, []);
    await seedRoles(db as unknown as Parameters<typeof seedRoles>[0]);
    expect(JSON.stringify([...saved])).toBe(initial);
    for (const role of Object.values(R))
      expect(
        saved
          .get(role)!
          .filter((permission) => all.includes(permission))
          .sort(),
      ).toEqual([...(expected.get(role) ?? [])].sort());
  } finally {
    log.mockRestore();
  }
});
