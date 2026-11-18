import { readFileSync } from 'fs';
import { join } from 'path';

type Call = { model: string; where: Record<string, unknown>; data: Record<string, unknown> };
const calls: Call[] = [];

// A transaction client that records every updateMany, whatever the model. One delegate per model.
const delegates: Record<string, any> = {};
const tx: any = new Proxy({}, {
  get(_target, model: string) {
    if (model === '$queryRaw') return jest.fn().mockResolvedValue([]);
    if (model === 'then') return undefined;
    return delegates[model] ??= {
      updateMany: jest.fn(async ({ where, data }: Omit<Call, 'model'>) => { calls.push({ model, where, data }); return { count: 1 }; }),
      findMany: jest.fn(async () => [{ id: SOURCE }, { id: TARGET }]),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async ({ data }: { data: unknown }) => ({ id: TARGET, ...(data as object) })),
      create: jest.fn(async ({ data }: { data: unknown }) => data),
    };
  },
});

jest.mock('../../prisma/client', () => ({
  __esModule: true,
  default: { $transaction: jest.fn((work: (client: unknown) => unknown) => work(tx)) },
}));

import { CustomerService } from './customer.service';

const SOURCE = '00000000-0000-4000-8000-00000000000a';
const TARGET = '00000000-0000-4000-8000-00000000000b';

// Relations to Customer that a merge deliberately leaves on the merged-away customer.
const KEPT: Record<string, string> = {
  'CustomerAccount.customerId': 'the old portal login is disabled, not transferred',
  'Notification.customerId': 'portal notifications belong to the disabled login',
};

/** Every `Model.field` in the schema that is a foreign key to Customer. */
function customerRelations(): string[] {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const relations: string[] = [];
  for (const [, model, body] of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const line of body.split('\n')) {
      const fk = line.match(/^\s+\w+\s+Customer\??\s+@relation\(.*fields:\s*\[(\w+)\]/);
      if (fk) relations.push(`${model}.${fk[1]}`);
    }
  }
  return relations;
}

describe('Customer merge', () => {
  let audit: { action: string; details: string };

  beforeAll(async () => {
    await new CustomerService().merge(SOURCE, TARGET, 'actor');
    [[{ data: audit }]] = (tx.auditLog.create as jest.Mock).mock.calls;
  });

  it.each(customerRelations().filter(relation => !KEPT[relation]))('moves %s to the surviving customer', relation => {
    const [model, field] = relation.split('.');
    const delegate = model[0].toLowerCase() + model.slice(1);
    expect(calls).toContainEqual(expect.objectContaining({
      model: delegate,
      where: expect.objectContaining({ [field]: SOURCE }),
      data: expect.objectContaining({ [field]: TARGET }),
    }));
  });

  it('finds the relations it checks', () => {
    // Guards the schema parser: if it stopped matching, the per-relation checks above would pass vacuously.
    expect(customerRelations()).toEqual(expect.arrayContaining([
      'JobCard.customerId', 'Estimate.customerId', 'CustomerOrder.customerId', 'MaterialReceiptNote.vendorId',
    ]));
  });

  it('repoints customers merged into the duplicate earlier', () => {
    // mergedIntoId is a plain column, not a relation, so the schema scan above cannot see it.
    expect(calls).toContainEqual({ model: 'customer', where: { mergedIntoId: SOURCE }, data: { mergedIntoId: TARGET } });
  });

  it('records how many rows of each kind moved', () => {
    expect(audit.action).toBe('CUSTOMER_MERGE');
    expect(JSON.parse(audit.details)).toMatchObject({ sourceId: SOURCE, targetId: TARGET, moved: { estimates: 1, customerOrders: 1, vendorReceipts: 1 } });
  });
});

describe('Customer merge: corporate group', () => {
  const G = '00000000-0000-4000-8000-0000000000c1';
  const H = '00000000-0000-4000-8000-0000000000c2';

  /** Merges with the given groups and returns the survivor's new group and the audit details. */
  async function merge(duplicateGroup: string | null, survivorGroup: string | null) {
    (tx.customer.findMany as jest.Mock).mockResolvedValueOnce([
      { id: SOURCE, organizationId: duplicateGroup },
      { id: TARGET, organizationId: survivorGroup },
    ]);
    await new CustomerService().merge(SOURCE, TARGET, 'actor');
    const survivor = (tx.customer.update as jest.Mock).mock.calls.map(([args]) => args).filter(args => args.where.id === TARGET).at(-1);
    const [[{ data: audit }]] = (tx.auditLog.create as jest.Mock).mock.calls;
    return { group: survivor.data.organizationId, details: JSON.parse(audit.details) };
  }

  it('joins the duplicate\'s group when the survivor has none', async () => {
    const { group, details } = await merge(G, null);
    expect(group).toBe(G);
    expect(details.joinedOrganizationId).toBe(G);
  });

  it('keeps the survivor\'s group and records the dropped one', async () => {
    const { group, details } = await merge(G, H);
    expect(group).toBe(H);
    expect(details.droppedOrganizationId).toBe(G);
    expect(details.joinedOrganizationId).toBeUndefined();
  });

  it('records nothing when both are in the same group', async () => {
    const { group, details } = await merge(G, G);
    expect(group).toBe(G);
    expect(details).not.toHaveProperty('droppedOrganizationId');
    expect(details).not.toHaveProperty('joinedOrganizationId');
  });

  it('moves a survivor that belonged to the duplicate into the duplicate\'s own group', async () => {
    const { group } = await merge(G, SOURCE);
    expect(group).toBe(G);
  });

  it('never puts the survivor in its own group', async () => {
    expect((await merge(TARGET, null)).group).toBeNull();
    expect((await merge(null, SOURCE)).group).toBeNull();
  });
});
