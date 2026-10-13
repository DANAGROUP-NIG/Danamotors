import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import seedPermissionsAndRoles from './roles';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../../src/shared/constants/roles';

async function verify() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point to a disposable database ending in _test');
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const customName = `issue96-custom-${Date.now()}`;
  try {
    await seedPermissionsAndRoles(prisma);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { name: PERMISSIONS.BRANCH_ALL } });
    const custom = await prisma.role.create({ data: {
      name: customName,
      permissions: { create: { permissionId: permission.id } },
    } });
    await seedPermissionsAndRoles(prisma);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    for (const roleName of Object.values(ROLES)) {
      const role = roles.find(item => item.name === roleName);
      assert(role, `Missing role ${roleName}`);
      assert.deepEqual(new Set(role.permissions.map(item => item.permission.name)), new Set(ROLE_PERMISSIONS[roleName]));
    }
    const retained = roles.find(role => role.id === custom.id);
    assert.deepEqual(retained?.permissions.map(item => item.permission.name), [PERMISSIONS.BRANCH_ALL]);
    console.log('Verified: two seed runs retain every built-in grant and a custom branch:all role.');
  } finally {
    await prisma.role.deleteMany({ where: { name: customName } });
    await prisma.$disconnect();
  }
}

verify().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
