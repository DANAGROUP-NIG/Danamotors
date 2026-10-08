jest.mock('../../prisma/client', () => ({ __esModule: true, default: { customer: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() } } }));
import type { Request, Response } from 'express';
import prisma from '../../prisma/client';
import { accountantCustomerReadScope } from './customer-read-scope';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { CustomerRepository } from './customer.repository';
import { ROLES } from '../../shared/constants/roles';
const id = '00000000-0000-4000-8000-000000000001';
const request = (path: string, role: string = ROLES.ACCOUNTANT, branchId: string | null = 'own') => ({ method: 'GET', path, user: { role, branchId }, query: {} } as unknown as Request);
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res as unknown as Response; };
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());
it.each(['/' + id, '/' + id + '/documents', '/' + id + '/service-history'])('blocks foreign customer reads on %s', async path => {
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ branchId: 'foreign' });
  const next = jest.fn(); await accountantCustomerReadScope(request(path), response(), next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
});
it('rejects unassigned Accountants and the global duplicate lookup', async () => {
  const next = jest.fn();
  await accountantCustomerReadScope(request('/', ROLES.ACCOUNTANT, null), response(), next);
  await accountantCustomerReadScope(request('/duplicates'), response(), next);
  expect(next.mock.calls).toEqual([[expect.objectContaining({ statusCode: 403 })], [expect.objectContaining({ statusCode: 403 })]]);
});
it('allows own-branch detail and retains Admin cross-branch reads', async () => {
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ branchId: 'own' });
  const next = jest.fn(); await accountantCustomerReadScope(request('/' + id), response(), next);
  await accountantCustomerReadScope(request('/' + id, ROLES.ADMIN), response(), next);
  expect(next.mock.calls).toEqual([[], []]); expect(prisma.customer.findUnique).toHaveBeenCalledTimes(1);
});
it('passes the assigned branch to the customer list service', async () => {
  const list = jest.spyOn(CustomerService.prototype, 'listCustomers').mockResolvedValue({ customers: [], meta: { total: 0, page: 1, limit: 10, totalPages: 0 } });
  await new CustomerController().getCustomers(request('/'), response(), jest.fn());
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ branchId: 'own' }));
});
it('applies the same branch predicate to list rows and count', async () => {
  (prisma.customer.findMany as jest.Mock).mockResolvedValue([]); (prisma.customer.count as jest.Mock).mockResolvedValue(0);
  await new CustomerRepository().listCustomers({ skip: 0, take: 10, branchId: 'own' });
  expect(prisma.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { branchId: 'own', mergedIntoId: null } }));
  expect(prisma.customer.count).toHaveBeenCalledWith({ where: { branchId: 'own', mergedIntoId: null } });
});
