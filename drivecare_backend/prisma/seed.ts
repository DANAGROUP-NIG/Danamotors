import { PrismaClient } from '@prisma/client';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from '../src/shared/constants/roles';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Seed Permissions
  console.log('Seeding permissions...');
  const permissionEntries = Object.values(PERMISSIONS);
  const dbPermissions = [];

  for (const permName of permissionEntries) {
    const dbPerm = await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: {
        name: permName,
        description: `Permission to perform ${permName.replace(':', ' ')} operations`,
      },
    });
    dbPermissions.push(dbPerm);
  }
  console.log(`✅ Seeded ${dbPermissions.length} permissions.`);

  // 2. Seed Roles and map Permissions
  console.log('Seeding roles and role-permissions...');
  const roleEntries = Object.values(ROLES);

  for (const roleName of roleEntries) {
    const dbRole = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: `${roleName} user role`,
      },
    });

    // Link permissions
    const allowedPerms = ROLE_PERMISSIONS[roleName];
    const permRecords = await prisma.permission.findMany({
      where: {
        name: { in: allowedPerms },
      },
    });

    // Delete existing links for this role to avoid duplicates/stale links
    await prisma.rolePermission.deleteMany({
      where: { roleId: dbRole.id },
    });

    // Create new links
    if (permRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permRecords.map((perm) => ({
          roleId: dbRole.id,
          permissionId: perm.id,
        })),
      });
    }

    console.log(`👤 Seeded role '${roleName}' with ${permRecords.length} permissions.`);
  }

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error while seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
