import type { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedDepartmentRoles } from "../../prisma/seed-department-roles";
import { EVERY_ROLE_PERMISSIONS, NEW_DEPARTMENT_ROLE_BASES, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "./roles";

it("deploys the same department permissions as the seed", () => {
  const sql = readFileSync(resolve(__dirname, "../../../prisma/migrations/20261125120000_department_roles/migration.sql"), "utf8");
  const templates = new Map([...sql.matchAll(/\('([A-Za-z]+)', ARRAY\[([^\]]+)\]\)/g)].map(
    ([, template, permissions]) => [template, [...permissions.matchAll(/'([^']+)'/g)].map(([, permission]) => permission)],
  ));
  const roles = [...sql.matchAll(/\('([A-Za-z]+)', '([A-Za-z]+)', (true|false)\)/g)];
  // Grants added to the department roles after they were created: PSF access, then dispatch challans.
  const grantSql = ["20261125130000_department_role_psf_grants", "20261126100000_department_role_challan_grants"]
    .map((migration) => readFileSync(resolve(__dirname, `../../../prisma/migrations/${migration}/migration.sql`), "utf8"))
    .join("\n");
  const psfGrants = [...grantSql.matchAll(/\('([A-Za-z]+)', '([^']+)'\)/g)];
  // Granted to every role row, whatever its name.
  const everyRoleSql = readFileSync(resolve(__dirname, "../../../prisma/migrations/20261126130000_campaign_manual_read_permission/migration.sql"), "utf8");
  expect(EVERY_ROLE_PERMISSIONS.every((permission) => everyRoleSql.includes(`'${permission}'`))).toBe(true);
  expect(roles.map(([, role]) => role).sort()).toEqual(Object.keys(NEW_DEPARTMENT_ROLE_BASES).sort());
  expect([...new Set(psfGrants.map(([, role]) => role))].every(
    role => Object.hasOwn(NEW_DEPARTMENT_ROLE_BASES, role),
  )).toBe(true);
  for (const [, role, template, allBranches] of roles) {
    const roleName = role as keyof typeof NEW_DEPARTMENT_ROLE_BASES;
    expect(template).toBe(NEW_DEPARTMENT_ROLE_BASES[roleName]);
    const grants = [
      ...templates.get(template)!,
      ...(allBranches === "true" ? [PERMISSIONS.BRANCH_ALL] : []),
      ...psfGrants.filter(([, target]) => target === role).map(([, , permission]) => permission),
      ...EVERY_ROLE_PERMISSIONS,
    ];
    expect(grants.sort()).toEqual([...new Set(ROLE_PERMISSIONS[roleName])].sort());
  }
});

it("creates only missing department roles and leaves existing role grants intact on rerun", async () => {
  const existing = [
    ROLES.WORKSHOP_MANAGER,
    ROLES.ACCOUNT_OFFICER,
    "CustomRole",
  ];
  const roles = new Set<string>(existing);
  const grants = new Map(existing.map((role) => [role, ["existing-grant"]]));
  const tx = {
    role: {
      createMany: jest.fn(
        async ({ data: [{ name }] }: { data: [{ name: string }] }) => {
          if (roles.has(name)) return { count: 0 };
          roles.add(name);
          return { count: 1 };
        },
      ),
      findUniqueOrThrow: jest.fn(
        async ({ where: { name } }: { where: { name: string } }) => ({
          id: name,
        }),
      ),
    },
    permission: {
      findMany: jest.fn(
        async ({
          where: {
            name: { in: names },
          },
        }: {
          where: { name: { in: string[] } };
        }) => [...new Set(names)].map((id) => ({ id })),
      ),
    },
    rolePermission: {
      createMany: jest.fn(
        async ({
          data,
        }: {
          data: { roleId: string; permissionId: string }[];
        }) => {
          for (const { roleId, permissionId } of data) {
            grants.set(roleId, [...(grants.get(roleId) ?? []), permissionId]);
          }
        },
      ),
    },
  };
  const prisma = {
    $transaction: (work: (client: typeof tx) => Promise<void>) => work(tx),
  } as unknown as PrismaClient;
  await seedDepartmentRoles(prisma);
  await seedDepartmentRoles(prisma);

  for (const role of existing)
    expect(grants.get(role)).toEqual(["existing-grant"]);
  const added = (
    Object.keys(
      NEW_DEPARTMENT_ROLE_BASES,
    ) as (keyof typeof NEW_DEPARTMENT_ROLE_BASES)[]
  ).filter((role) => !existing.includes(role));
  expect(roles).toEqual(new Set([...existing, ...added]));
  for (const role of added)
    expect(grants.get(role)).toEqual([...new Set(ROLE_PERMISSIONS[role])]);
  expect(tx.rolePermission.createMany).toHaveBeenCalledTimes(added.length);
});
