import { PrismaClient } from "@prisma/client";
import {
  NEW_DEPARTMENT_ROLE_BASES,
  ROLES,
  ROLE_PERMISSIONS,
  PERMISSIONS,
} from "../../src/shared/constants/roles";
import { seedDepartmentRoles } from "../../src/prisma/seed-department-roles";

export default async function seedPermissionsAndRoles(prisma: PrismaClient) {
  const permissionEntries = Object.values(PERMISSIONS);
  for (const permName of permissionEntries) {
    await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: {
        name: permName,
        description: `Permission to perform ${permName.replace(":", " ")} operations`,
      },
    });
  }
  console.log(`✅ Seeded ${permissionEntries.length} permissions`);

  for (const roleName of Object.values(ROLES)) {
    if (Object.hasOwn(NEW_DEPARTMENT_ROLE_BASES, roleName)) continue;
    const dbRole = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} user role` },
    });
    const allowedPerms = ROLE_PERMISSIONS[roleName];
    const permRecords = await prisma.permission.findMany({
      where: { name: { in: allowedPerms } },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    if (permRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permRecords.map((p) => ({
          roleId: dbRole.id,
          permissionId: p.id,
        })),
      });
    }
    console.log(`  👤 Role '${roleName}' → ${permRecords.length} permissions`);
  }
  await seedDepartmentRoles(prisma);
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDepartmentRoles(prisma)
    .catch((error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
