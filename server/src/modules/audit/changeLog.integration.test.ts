/**
 * Change-log triggers end to end against a real PostgreSQL database (migration 20261105130000_change_log):
 * user attribution through the Prisma client, masking of secrets, outside-the-app detection and the
 * append-only guard. Skipped unless TEST_DATABASE_URL is set. Never point it at a shared database.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest changeLog.integration
 */
import { PrismaClient } from '@prisma/client';

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Change log (database)', () => {
  let prisma: PrismaClient;
  let runAsUser: <T>(userId: string | undefined, fn: () => T) => T;
  let outside: PrismaClient;
  const run = `${Date.now()}`.slice(-7);
  let userId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    runAsUser = require('../../shared/requestContext').runAsUser;
    // A plain connection without the API's application_name: "outside the app".
    outside = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.bank.deleteMany({ where: { code: { startsWith: `CL${run}` } } });
    await outside.$disconnect();
    await prisma.$disconnect();
  });

  const history = (recordId: string) => prisma.changeLog.findMany({ where: { recordId }, orderBy: { id: 'asc' } });

  it('records who changed which field, in and out of transactions', async () => {
    const bank = await prisma.bank.create({ data: { code: `CL${run}A`, name: 'Bank A' } });
    await runAsUser(userId, async () => {
      await prisma.bank.update({ where: { id: bank.id }, data: { name: 'Bank B' } });
      await prisma.$transaction(async (tx) => { await tx.bank.update({ where: { id: bank.id }, data: { accountNumber: '42' } }); });
      await prisma.$transaction([prisma.bank.update({ where: { id: bank.id }, data: { active: false } })]);
      await prisma.bank.update({ where: { id: bank.id }, data: { name: 'Bank B' } }); // nothing changes
    });
    const rows = await history(bank.id);
    expect(rows.map((r) => [r.action, r.source, r.userId])).toEqual([
      ['INSERT', 'APP', null],
      ['UPDATE', 'APP', userId],
      ['UPDATE', 'APP', userId],
      ['UPDATE', 'APP', userId],
    ]);
    expect(rows[1].changes).toEqual([{ field: 'name', old: 'Bank A', new: 'Bank B' }]);
    expect(rows[3].changes).toEqual([{ field: 'active', old: true, new: false }]);
  });

  it('flags a change made directly in the database', async () => {
    const bank = await prisma.bank.create({ data: { code: `CL${run}B`, name: 'Bank C' } });
    await outside.bank.update({ where: { id: bank.id }, data: { name: 'Bank D' } });
    const last = (await history(bank.id)).pop()!;
    expect(last.source).toBe('DB');
    expect(last.userId).toBeNull();
  });

  it('never stores a password hash or reset token', async () => {
    await runAsUser(userId, () => prisma.user.update({ where: { id: userId }, data: { resetTokenHash: `secret-${run}` } }));
    await prisma.user.update({ where: { id: userId }, data: { resetTokenHash: null, resetTokenExpiry: null } });
    const rows = await history(userId);
    expect(JSON.stringify(rows.map((r) => r.changes))).not.toContain(`secret-${run}`);
    expect(rows.pop()!.changes).toEqual(expect.arrayContaining([{ field: 'resetTokenHash', masked: true }]));
  });

  it('is append-only', async () => {
    const row = await prisma.changeLog.findFirstOrThrow();
    await expect(prisma.$executeRaw`DELETE FROM "ChangeLog" WHERE id = ${row.id}`).rejects.toThrow(/append-only/);
  });
});
