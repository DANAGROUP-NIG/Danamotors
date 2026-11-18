/**
 * Per-user overrides against a real PostgreSQL database (migration 20261105140000_user_permission_overrides):
 * the API's permission check merges role + grants - denials, "users holding X" queries honour them, and
 * every override change is logged on the User. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest userPermission.integration
 */
import { PermissionEffect } from '@prisma/client';

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Per-user permissions (database)', () => {
  let prisma: typeof import('../../prisma/client').default;
  let runAsUser: <T>(userId: string | undefined, fn: () => T) => T;
  let loadStaffUser: typeof import('../../middleware/authMiddleware').loadStaffUser;
  let holdsPermission: typeof import('../../shared/effectivePermissions').holdsPermission;
  const run = `${Date.now()}`.slice(-7);
  let userId: string;
  let actorId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    runAsUser = require('../../shared/requestContext').runAsUser;
    loadStaffUser = require('../../middleware/authMiddleware').loadStaffUser;
    holdsPermission = require('../../shared/effectivePermissions').holdsPermission;
    const actor = await prisma.user.findFirstOrThrow({ select: { id: true } });
    actorId = actor.id;
    for (const name of ['customer:read', 'customer:delete', 'invoice:cancel'])
      await prisma.permission.upsert({ where: { name }, update: {}, create: { name } });
    const role = await prisma.role.upsert({
      where: { name: `UP${run}` },
      update: {},
      create: { name: `UP${run}`, permissions: { create: [
        { permission: { connect: { name: 'customer:read' } } },
        { permission: { connect: { name: 'customer:delete' } } },
      ] } },
    });
    const user = await prisma.user.create({
      data: { email: `up${run}@example.test`, passwordHash: 'x', firstName: 'Override', lastName: 'Test', roleId: role.id },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: `up${run}@example.test` } });
    await prisma.role.deleteMany({ where: { name: `UP${run}` } });
    await prisma.$disconnect();
  });

  it('merges grants and denials into the permissions the API checks', async () => {
    const [cancel, del] = await Promise.all([
      prisma.permission.findUniqueOrThrow({ where: { name: 'invoice:cancel' } }),
      prisma.permission.findUniqueOrThrow({ where: { name: 'customer:delete' } }),
    ]);
    await runAsUser(actorId, () => prisma.$transaction([
      prisma.userPermission.create({ data: { userId, permissionId: cancel.id, effect: PermissionEffect.GRANT } }),
      prisma.userPermission.create({ data: { userId, permissionId: del.id, effect: PermissionEffect.DENY } }),
    ]));

    const staff = await loadStaffUser(userId);
    expect(staff?.permissions).toEqual(['customer:read', 'invoice:cancel']);

    const holders = async (name: string) =>
      (await prisma.user.findMany({ where: { id: userId, AND: [holdsPermission(name)] }, select: { id: true } })).length;
    expect(await holders('invoice:cancel')).toBe(1);
    expect(await holders('customer:read')).toBe(1);
    expect(await holders('customer:delete')).toBe(0);
  });

  it('logs every grant, change and removal on the user', async () => {
    const cancel = await prisma.permission.findUniqueOrThrow({ where: { name: 'invoice:cancel' } });
    await runAsUser(actorId, async () => {
      await prisma.userPermission.update({ where: { userId_permissionId: { userId, permissionId: cancel.id } }, data: { effect: PermissionEffect.DENY } });
      await prisma.userPermission.delete({ where: { userId_permissionId: { userId, permissionId: cancel.id } } });
    });
    const rows = await prisma.changeLog.findMany({ where: { entity: 'User', recordId: userId, action: 'UPDATE' }, orderBy: { id: 'asc' } });
    const changes = rows.flatMap((r) => r.changes as { field: string; old: string | null; new: string | null }[]).filter((c) => c.field === 'permission');
    expect(changes).toEqual(expect.arrayContaining([
      { field: 'permission', old: null, new: 'GRANT invoice:cancel' },
      { field: 'permission', old: null, new: 'DENY customer:delete' },
      { field: 'permission', old: 'GRANT invoice:cancel', new: 'DENY invoice:cancel' },
      { field: 'permission', old: 'DENY invoice:cancel', new: null },
    ]));
    expect(rows.every((r) => r.userId === actorId && r.recordLabel?.includes(`up${run}@example.test`))).toBe(true);
  });

  it('seeds the Auditor role with reads and reports only', async () => {
    const auditor = await prisma.role.findUniqueOrThrow({
      where: { name: 'Auditor' },
      include: { permissions: { include: { permission: { select: { name: true } } } } },
    });
    const names = auditor.permissions.map((p) => p.permission.name);
    expect(names).toContain('audit:read');
    expect(names.every((n) => (n.endsWith(':read') || n.startsWith('report:')) && n !== 'report:settings')).toBe(true);
  });
});
