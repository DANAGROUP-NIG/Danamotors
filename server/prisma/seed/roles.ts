import { PrismaClient } from "@prisma/client";
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from "../../src/shared/constants/roles";

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
}
