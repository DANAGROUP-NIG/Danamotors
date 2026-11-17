/**
 * Books closed date against a real PostgreSQL database (migration 20261105160000_books_closed): the guard
 * triggers, the per-branch date, reopening, and the 409 from the error handler. Uses dates in 2001 so it
 * cannot affect other suites sharing the test database. Skipped unless TEST_DATABASE_URL is set.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/danamotors_test npx jest books-closed.integration
 */
// A module, so TEST_DB and describeDb stay local to this file (they clash as globals under ts-jest).
export {};

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeDb = TEST_DB ? describe : describe.skip;

jest.setTimeout(60_000);

describeDb('Books closed (database)', () => {
  let prisma: typeof import('../../prisma/client').default;
  let books: typeof import('./books-closed.service');
  let errorHandler: typeof import('../../middleware/errorHandler').errorHandler;
  const run = `${Date.now()}`.slice(-7);
  const actor = { userId: '' };
  let customerId: string;
  let branchA: string;
  let branchB: string;
  let n = 0;

  const receipt = (issuedAt: string, branchId: string) =>
    prisma.receipt.create({ data: { receiptNumber: `BC${run}-${++n}`, customerId, branchId, amount: 1000, issuedAt: new Date(issuedAt) } });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    prisma = require('../../prisma/client').default;
    books = require('./books-closed.service');
    errorHandler = require('../../middleware/errorHandler').errorHandler;
    actor.userId = (await prisma.user.findFirstOrThrow({ select: { id: true } })).id;
    customerId = (await prisma.customer.findFirstOrThrow({ select: { id: true } })).id;
    const branches = await prisma.branch.findMany({ take: 2, select: { id: true }, orderBy: { name: 'asc' } });
    [branchA, branchB] = branches.map((b) => b.id);
  });

  afterAll(async () => {
    await books.setBranchBooksClosed(actor, branchA, { closedUpTo: null, reason: 'test clean-up' }).catch(() => undefined);
    await books.setCompanyBooksClosed(actor, { closedUpTo: null, reason: 'test clean-up' }).catch(() => undefined);
    await prisma.receipt.deleteMany({ where: { receiptNumber: { startsWith: `BC${run}-` } } });
    await prisma.$disconnect();
  });

  it('closes the books and refuses back-dated, edited, cancelled or deleted entries', async () => {
    const old = await receipt('2001-06-01T10:00:00Z', branchA);
    const result = await books.setCompanyBooksClosed(actor, { closedUpTo: '2001-12-31' });
    expect(result.closedUpTo).toBe('2001-12-31');

    await expect(receipt('2001-07-01T10:00:00Z', branchA)).rejects.toThrow(/BOOKS_CLOSED: The books are closed up to 31 Dec 2001\. This receipt is dated 01 Jul 2001/);
    await expect(prisma.receipt.update({ where: { id: old.id }, data: { amount: 2000 } })).rejects.toThrow(/its amount cannot change/);
    await expect(prisma.receipt.update({ where: { id: old.id }, data: { cancelledAt: new Date(), status: 'CANCELLED' } })).rejects.toThrow(/its cancellation cannot change/);
    await expect(prisma.receipt.delete({ where: { id: old.id } })).rejects.toThrow(/cannot be deleted/);
    // Columns outside the guarded list still change (e.g. notes, Tally posting).
    await expect(prisma.receipt.update({ where: { id: old.id }, data: { notes: 'checked', tallyPostedAt: new Date() } })).resolves.toBeTruthy();

    const open = await receipt('2002-01-05T10:00:00Z', branchA);
    await expect(prisma.receipt.update({ where: { id: open.id }, data: { issuedAt: new Date('2001-12-20T10:00:00Z') } })).rejects.toThrow(/cannot be dated 20 Dec 2001/);
  });

  it('uses Lagos dates: 31 Dec 23:30 UTC is already 1 Jan in Lagos', async () => {
    await expect(receipt('2001-12-31T23:30:00Z', branchA)).resolves.toBeTruthy();
    await expect(receipt('2001-12-31T22:30:00Z', branchA)).rejects.toThrow(/BOOKS_CLOSED/);
  });

  it('lets one branch close later than the company', async () => {
    await expect(books.setBranchBooksClosed(actor, branchA, { closedUpTo: '2001-06-30' })).rejects.toThrow('a branch date must be later');
    const result = await books.setBranchBooksClosed(actor, branchA, { closedUpTo: '2002-06-30' });
    expect(result.branches.find((b) => b.branchId === branchA)).toMatchObject({ closedUpTo: '2002-06-30', effective: '2002-06-30' });
    expect(result.branches.find((b) => b.branchId === branchB)?.effective).toBe('2001-12-31');
    await expect(receipt('2002-03-01T10:00:00Z', branchA)).rejects.toThrow(/closed up to 30 Jun 2002/);
    await expect(receipt('2002-03-01T10:00:00Z', branchB)).resolves.toBeTruthy();
  });

  it('turns the database error into a 409 with a readable message', async () => {
    const error = await receipt('2001-03-01T10:00:00Z', branchB).catch((e: Error) => e);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(error as Error, {} as never, res as never, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      code: 'BOOKS_CLOSED',
      message: 'The books are closed up to 31 Dec 2001. This receipt is dated 01 Mar 2001; a closed period cannot get new entries.',
    });
  });

  it('needs a reason to reopen, and records it', async () => {
    await expect(books.setCompanyBooksClosed(actor, { closedUpTo: '2001-06-30' })).rejects.toThrow('Give a reason');
    const today = new Date().toISOString().slice(0, 10);
    await expect(books.setCompanyBooksClosed(actor, { closedUpTo: today })).rejects.toThrow('before today');
    await books.setCompanyBooksClosed(actor, { closedUpTo: '2001-06-30', reason: 'Audit adjustment for H2 2001' });
    const event = await prisma.auditLog.findFirstOrThrow({ where: { action: 'BOOKS_REOPENED', userId: actor.userId }, orderBy: { createdAt: 'desc' } });
    expect(JSON.parse(event.details!)).toMatchObject({ scope: 'COMPANY', from: '2001-12-31', to: '2001-06-30', reason: 'Audit adjustment for H2 2001' });
    // Branch B now follows the reopened company date.
    await expect(receipt('2001-09-01T10:00:00Z', branchB)).resolves.toBeTruthy();
  });
});
