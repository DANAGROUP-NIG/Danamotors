import { createCustomerSchema, listCustomerSchema, updateCustomerSchema } from './customer.validation';
import { CustomerService } from './customer.service';
import { withPartyTransaction } from '../finance/party-account.service';

jest.mock('../finance/party-account.service', () => ({ withPartyTransaction: jest.fn() }));

const branchId = '123e4567-e89b-42d3-a456-426614174000';
const customer = { branchId, phoneNumber: '0000000000' };

describe('Customer category validation', () => {
  it.each(['INDIVIDUAL', 'CORPORATE', 'GOVERNMENT', 'IN_HOUSE', 'OTHERS'])(
    'accepts %s on create and as a directory filter',
    (type) => {
      expect(createCustomerSchema.safeParse({
        body: { ...customer, type, firstName: 'Test', lastName: 'Party', companyName: 'Test company' },
      }).success).toBe(true);
      expect(listCustomerSchema.safeParse({ query: { category: type } }).success).toBe(true);
    },
  );

  it('accepts Vendor only as party status and excludes it from category filters', () => {
    expect(createCustomerSchema.safeParse({
      body: { ...customer, partyStatus: 'VENDOR', companyName: 'Test supplier' },
    }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ body: { ...customer, type: 'VENDOR' } }).success).toBe(false);
    expect(listCustomerSchema.safeParse({ query: { category: 'VENDOR' } }).success).toBe(false);
  });

  it('refuses independently writable company vehicle flags', () => {
    expect(updateCustomerSchema.safeParse({
      params: { id: branchId }, body: { type: 'IN_HOUSE', ownCompanyVehicle: false },
    }).success).toBe(false);
  });

  it('allows Others to retain a named contact without requiring an organization', () => {
    expect(createCustomerSchema.safeParse({
      body: { ...customer, type: 'OTHERS', firstName: 'Test', lastName: 'Party' },
    }).success).toBe(true);
  });
});

describe('Customer category updates', () => {
  const update = jest.fn();
  const createAudit = jest.fn();
  const row = {
    id: 'customer-fixture', branchId, type: 'CORPORATE', partyStatus: 'CUSTOMER',
    companyName: 'Test company', phoneNumber: customer.phoneNumber, mergedIntoId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const transaction = {
      $queryRaw: jest.fn(),
      customer: { findUnique: jest.fn().mockResolvedValue(row), update },
      auditLog: { create: createAudit },
    };
    (withPartyTransaction as jest.Mock).mockImplementation(work => work(transaction));
    update.mockResolvedValue({ ...row, type: 'IN_HOUSE' });
  });

  it('records category changes without logging customer contact details', async () => {
    await new CustomerService().updateCustomer(row.id, { type: 'IN_HOUSE' }, { id: 'actor', branchId });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'IN_HOUSE' }) }));
    expect(createAudit).toHaveBeenCalledWith({ data: {
      userId: 'actor', action: 'CUSTOMER_CATEGORY_CHANGED',
      details: JSON.stringify({
        customerId: row.id,
        before: { category: 'CORPORATE', partyStatus: 'CUSTOMER' },
        after: { category: 'IN_HOUSE', partyStatus: 'CUSTOMER' },
      }),
    } });
  });

  it('refuses foreign-branch category updates before writing or auditing', async () => {
    await expect(new CustomerService().updateCustomer(row.id, { type: 'IN_HOUSE' }, { id: 'actor', branchId: 'other' }))
      .rejects.toThrow('only update customers in your own branch');
    expect(update).not.toHaveBeenCalled();
    expect(createAudit).not.toHaveBeenCalled();
  });
});
