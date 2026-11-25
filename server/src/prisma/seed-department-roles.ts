import type { PrismaClient } from "@prisma/client";
import {
  NEW_DEPARTMENT_ROLE_BASES,
  ROLE_PERMISSIONS,
} from "../shared/constants/roles";

const departmentRoles = Object.keys(NEW_DEPARTMENT_ROLE_BASES) as Array<
  keyof typeof NEW_DEPARTMENT_ROLE_BASES
>;

export async function seedDepartmentRoles(prisma: PrismaClient) {
  await prisma.$transaction(async (tx) => {
    for (const name of departmentRoles) {
      const inserted = await tx.role.createMany({
        data: [{ name, description: `${name} user role` }],
        skipDuplicates: true,
      });
      if (!inserted.count) continue;
      const role = await tx.role.findUniqueOrThrow({ where: { name } });
      const permissions = await tx.permission.findMany({
        where: { name: { in: ROLE_PERMISSIONS[name] } },
      });
      if (permissions.length !== new Set(ROLE_PERMISSIONS[name]).size) {
        throw new Error(`Seed the permission catalog before creating ${name}`);
      }
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
      });
    }
  });
}
