jest.mock('../../prisma/client', () => ({
  __esModule: true,

  default: {
    customer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },

    documentSequence: {
      upsert: jest.fn(),
    },

    $transaction: jest.fn(),
  },
}));

import prisma from '../../prisma/client';
import { CustomerService, customerCodePrefix } from './customer.service';
import { createCustomerSchema } from './customer.validation';

describe('Workshop customer identity', () => {
  const branchId = '00000000-0000-4000-8000-000000000001';

  const body = {
    firstName: 'Ada',
    lastName: 'Obi',
    phoneNumber: '08012345678',
    branchId,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));

    (prisma.customer.findMany as jest.Mock).mockResolvedValue([{
      id: 'existing',
      firstName: 'Ada',
      lastName: 'Obi',
    }]);

    (prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);

    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValue({
      value: 12,
    });

    (prisma.customer.create as jest.Mock).mockImplementation((
      {
        data,
      },
    ) => Promise.resolve({
      id: 'new',
      ...data,
    }));
  });

  it('accepts absent or blank email and requires mobile', () => {
    expect(createCustomerSchema.parse({
      body,
    }).body.email).toBeUndefined();

    expect(createCustomerSchema.parse({
      body: {
        ...body,
        email: '',
      },
    }).body.email).toBeNull();

    expect(createCustomerSchema.safeParse({
      body: {
        ...body,
        phoneNumber: '',
      },
    }).success).toBe(false);
  });

  it('generates a name-prefixed code and reports duplicates without blocking', async () => {
    expect(customerCodePrefix('  ada')).toBe('A');

    const result = await new CustomerService().createCustomer({
      ...body,
      type: 'INDIVIDUAL',
    });

    expect(result.code).toBe('A000012');
    expect(result.email).toBeNull();
    expect(result.duplicates).toHaveLength(1);

    expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        mergedIntoId: null,

        OR: expect.arrayContaining([{
          phoneNumber: body.phoneNumber,
        }, {
          firstName: {
            equals: 'Ada',
            mode: 'insensitive',
          },

          lastName: {
            equals: 'Obi',
            mode: 'insensitive',
          },
        }]),
      },
    }));
  });

  it('skips occupied legacy codes', async () => {
    (prisma.customer.findUnique as jest.Mock).mockResolvedValueOnce({
      code: 'A000012',
    }).mockResolvedValueOnce(null);

    (prisma.documentSequence.upsert as jest.Mock).mockResolvedValueOnce({
      value: 12,
    }).mockResolvedValueOnce({
      value: 13,
    });

    expect((await new CustomerService().createCustomer({
      ...body,
      type: 'INDIVIDUAL',
    })).code).toBe('A000013');
  });

  it('supports corporates without individual names and fixes their salutation', async () => {
    const corporate = createCustomerSchema.parse({
      body: {
        phoneNumber: body.phoneNumber,
        branchId,
        type: 'CORPORATE',
        companyName: 'Dana',
        salutation: 'Mr.',
      },
    }).body;

    expect((await new CustomerService().createCustomer(corporate)).salutation).toBe('M/S.');

    expect(createCustomerSchema.safeParse({
      body: {
        ...body,
        type: 'CORPORATE',
      },
    }).success).toBe(false);
  });

  it('requires individual names and rejects malformed email', () => {
    expect(createCustomerSchema.safeParse({
      body: {
        ...body,
        lastName: '',
      },
    }).success).toBe(false);

    expect(createCustomerSchema.safeParse({
      body: {
        ...body,
        email: 'bad',
      },
    }).success).toBe(false);
  });
});
