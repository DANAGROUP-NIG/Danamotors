/**
 * Customer merge additions against a real PostgreSQL database: duplicate groups, choosing which record's
 * details survive, and the merge history (including a chain of merges). Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest customer-merge-extras.integration
 */
const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Customer merge history and duplicates (database)', () => {
  let prisma: typeof import('../../prisma/client').default;
  let extras: typeof import('./customer-merge-extras');
  let service: import('./customer.service').CustomerService;
  const run = `${Date.now()}`.slice(-7);
  const phone = `0803${run}`;
  let actorId: string;
  let branchId: string;
  const ids: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    extras = require('./customer-merge-extras');
    const { CustomerService } = require('./customer.service');
    service = new CustomerService();
    actorId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    branchId = (await prisma.branch.findFirstOrThrow({ select: { id: true } })).id;
    const make = (key: keyof typeof ids, data: object) =>
      prisma.customer.create({ data: { branchId, firstName: 'Merge', lastName: `Test ${key}`, ...data } }).then((c) => { ids[key] = c.id; });
    await make('a', { firstName: 'Adaeze', lastName: `Okafor${run}`, phoneNumber: phone, email: `a${run}@example.test`, city: 'Abuja' });
    await make('b', { firstName: 'Ada', lastName: `Okafor${run}`, phoneNumber: `+234 ${phone.slice(1)}`, city: 'Lagos' });
    await make('c', { phoneNumber: phone });
    await make('d', { firstName: 'Other', lastName: `Person${run}` });
  });

  afterAll(async () => {
    for (const key of ['a', 'c', 'b', 'd'] as const) await prisma.customer.deleteMany({ where: { id: ids[key] } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('groups customers that share the last 10 digits of their phone', async () => {
    const { groups } = await extras.duplicateGroups({ by: 'phone', page: 1, limit: 100 });
    const group = groups.find((g) => g.key === phone.slice(-10));
    expect(group?.members.map((m) => m.id).sort()).toEqual([ids.a, ids.b, ids.c].sort());
  });

  it('lets the kept customer take the duplicate\'s name and email, and records both as they were', async () => {
    await service.merge(ids.a, ids.b, actorId, { name: 'SOURCE', email: 'SOURCE' });
    const [a, b] = await Promise.all([prisma.customer.findUniqueOrThrow({ where: { id: ids.a } }), prisma.customer.findUniqueOrThrow({ where: { id: ids.b } })]);
    expect(b).toMatchObject({ firstName: 'Adaeze', email: `a${run}@example.test`, city: 'Lagos' }); // address kept
    expect(a).toMatchObject({ mergedIntoId: ids.b, email: null });

    const [entry] = await extras.mergeHistory(ids.b);
    expect(entry).toMatchObject({
      duplicate: { id: ids.a, name: `Adaeze Okafor${run}`, email: `a${run}@example.test` },
      survivorBefore: { name: `Ada Okafor${run}` },
      kept: { name: 'SOURCE', email: 'SOURCE' },
      intoEarlierRecord: false,
    });
  });

  it('shows earlier merges after the kept customer is itself merged', async () => {
    await service.merge(ids.c, ids.b, actorId);
    await service.merge(ids.b, ids.d, actorId);
    const history = await extras.mergeHistory(ids.d);
    expect(history.map((h) => h.duplicate.id).sort()).toEqual([ids.a, ids.b, ids.c].sort());
    expect(history.filter((h) => h.intoEarlierRecord).map((h) => h.duplicate.id).sort()).toEqual([ids.a, ids.c].sort());
    // Merged customers drop out of the duplicate groups.
    const { groups } = await extras.duplicateGroups({ by: 'phone', page: 1, limit: 100 });
    expect(groups.find((g) => g.key === phone.slice(-10))).toBeUndefined();
  });
});
