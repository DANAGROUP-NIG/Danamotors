jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  branch: { findFirst: jest.fn() },
  receipt: { update: jest.fn() }, partyNote: { update: jest.fn() },
  receiptAllocation: { createMany: jest.fn() }, partyAdjustmentBatch: { findUnique: jest.fn(), create: jest.fn() },
  customerCreditApplication: { findUnique: jest.fn(), findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  customer: { findUnique: jest.fn(), update: jest.fn() },
  invoice: { findUnique: jest.fn(), update: jest.fn() },
  customerCreditTransaction: { create: jest.fn() }, payment: { create: jest.fn() }, auditLog: { create: jest.fn() },
} }));
jest.mock('../notification/notification.service', () => ({ NotificationService: jest.fn().mockImplementation(() => ({ notifyRole: jest.fn(), notifyUsers: jest.fn() })) }));

import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { CreditService } from './credit.service';

const customerId = 'customer';
const applicationId = 'application';
const invoice = { id: 'invoice', customerId, invoiceNumber: '2026000001', total: 100, outstandingAmount: 60, status: 'Partially Paid', issuedDate: new Date('2026-01-01') };
const application = { id: applicationId, customerId, invoiceId: invoice.id, requestedById: 'advisor', amount: 40, status: 'Pending', invoice, customer: { branchId: 'branch' } };
const customer = { id: customerId, creditBalance: 100, branchId: 'branch' };

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.$transaction as jest.Mock).mockReset().mockImplementation(cb => cb(prisma));
  (prisma.customerCreditApplication.findUnique as jest.Mock).mockReset().mockResolvedValue(application);
  (prisma.customerCreditApplication.update as jest.Mock).mockResolvedValue({ ...application, status: 'Approved' });
  (prisma.customerCreditApplication.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.customerCreditApplication.findUniqueOrThrow as jest.Mock).mockResolvedValue({ ...application, status: 'Declined' });
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue(customer);
  (prisma.invoice.findUnique as jest.Mock).mockResolvedValue(invoice);
  (prisma.customerCreditApplication.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.branch.findFirst as jest.Mock).mockResolvedValue({ id:'branch' });
  (prisma.partyAdjustmentBatch.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.partyAdjustmentBatch.create as jest.Mock).mockImplementation(({data})=>Promise.resolve({id:'batch',...data}));
  (prisma.$queryRaw as jest.Mock).mockImplementation(async query=> {
    if (!query.sql.startsWith('SELECT * FROM (')) return query.sql.includes('AS amount') ? [{amount:new Prisma.Decimal(60)}] : [];
    if (query.sql.includes('FROM "Invoice"')) { const current = await prisma.invoice.findUnique({where:{id:invoice.id}}); return [{...current,kind:'INVOICE',number:current!.invoiceNumber,date:current!.issuedDate,amount:current!.total,balance:current!.outstandingAmount}]; }
    return [{id:'receipt',kind:'RECEIPT',number:'2026000002',date:new Date('2026-01-01'),amount:100,balance:100}];
  });
});

it('reduces stored outstanding even when earlier receipts have no Payment rows', async () => {
  await new CreditService().decideApplication(customerId, applicationId, { approved: true });
  expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: invoice.id }, data: { outstandingAmount: 20, status: 'Partially Paid' } });
  expect(prisma.customer.update).not.toHaveBeenCalled();
  expect(prisma.receipt.update).toHaveBeenCalledWith({ where: { id: 'receipt' }, data: { advanceAmount: 60 } });
  expect(prisma.payment.create).not.toHaveBeenCalled();
  expect(prisma.receiptAllocation.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ invoiceId: invoice.id, receiptId:'receipt', batchId:'batch', amount:40 })] });
  expect(prisma.customerCreditTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: -40, balanceAfter: 60, referenceId: applicationId }) });
  expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { action: 'CREDIT_APPLICATION_APPROVED', details: expect.any(String) } });
  const details = JSON.parse((prisma.auditLog.create as jest.Mock).mock.calls.find(call=>call[0].data.action==='CREDIT_APPLICATION_APPROVED')[0].data.details);
  expect(details).toMatchObject({ customerId, applicationId, outstandingBefore: 60, outstandingAfter: 20, batchId:'batch' });
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
  expect((prisma.$queryRaw as jest.Mock).mock.calls.map(call => call[0].sql)).toEqual(expect.arrayContaining([
    expect.stringContaining('"CustomerCreditApplication" WHERE id = ? FOR UPDATE'),
    expect.stringContaining('"Customer" WHERE id = ? FOR UPDATE'),
    expect.stringContaining('"Invoice" WHERE id = ? FOR UPDATE'),
  ]));
});

it('marks the bill Paid when credit settles the remaining balance', async () => {
  (prisma.customerCreditApplication.findUnique as jest.Mock).mockResolvedValue({ ...application, amount: 60 });
  await new CreditService().decideApplication(customerId, applicationId, { approved: true });
  expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: invoice.id }, data: { outstandingAmount: 0, status: 'Paid' } });
});

it('subtracts fractional currency with Decimal money helpers', async () => {
  (prisma.customerCreditApplication.findUnique as jest.Mock).mockResolvedValue({ ...application, amount: 0.1 });
  (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({ ...invoice, outstandingAmount: 0.3 });
  (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ ...customer, creditBalance: 0.3 });
  await new CreditService().decideApplication(customerId, applicationId, { approved: true });
  expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: invoice.id }, data: { outstandingAmount: 0.2, status: 'Partially Paid' } });
  expect(prisma.customer.update).not.toHaveBeenCalled();
});

it('rejects credit exceeding the balance after another receipt without financial writes', async () => {
  (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({ ...invoice, outstandingAmount: 30 });
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('outstanding balance');
  expect(prisma.payment.create).not.toHaveBeenCalled();
  expect(prisma.customer.update).not.toHaveBeenCalled();
  expect(prisma.invoice.update).not.toHaveBeenCalled();
});

it('rechecks Pending after locking to prevent a double approval', async () => {
  (prisma.customerCreditApplication.findUnique as jest.Mock).mockResolvedValueOnce(application).mockResolvedValueOnce({ ...application, status: 'Approved' });
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('already been decided');
  expect(prisma.payment.create).not.toHaveBeenCalled();
  expect(prisma.customer.update).not.toHaveBeenCalled();
});

it('rejects approval belonging to another customer', async () => {
  await expect(new CreditService().decideApplication('other-customer', applicationId, { approved: true })).rejects.toThrow('not found');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rechecks available credit before approval', async () => {
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('Insufficient credit');
  expect(prisma.payment.create).not.toHaveBeenCalled();
});

it.each(['Cancelled', 'CANCELLED', 'CANCELED', 'VOID'])('rejects %s bills', async status => {
  (prisma.invoice.findUnique as jest.Mock).mockResolvedValue({ ...invoice, status });
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('Cannot apply credit');
  expect(prisma.payment.create).not.toHaveBeenCalled();
});

it('checks application requests against stored outstanding instead of Payment totals', async () => {
  await expect(new CreditService().createApplication({ customerId, invoiceId: invoice.id, amount: 70, requestedById: 'advisor' })).rejects.toThrow('outstanding balance');
  expect(prisma.customerCreditApplication.create).not.toHaveBeenCalled();
});

it('rejects a request that rounds to zero', async () => {
  await expect(new CreditService().createApplication({ customerId, invoiceId: invoice.id, amount: 0.001, requestedById: 'advisor' })).rejects.toThrow('at least 0.01');
  expect(prisma.customerCreditApplication.create).not.toHaveBeenCalled();
});

it('retries only confirmed serialization rollbacks', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6.16.2' }));
  await new CreditService().decideApplication(customerId, applicationId, { approved: true });
  expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  expect(prisma.receiptAllocation.createMany).toHaveBeenCalledTimes(1);
});

it('bounds serialization retries and never replays timeouts', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6.16.2' }));
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('database is busy');
  expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  (prisma.$transaction as jest.Mock).mockReset().mockRejectedValue(new Prisma.PrismaClientKnownRequestError('timeout', { code: 'P2028', clientVersion: '6.16.2' }));
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: true })).rejects.toThrow('database is busy');
  expect(prisma.$transaction).toHaveBeenCalledTimes(1);
});

it('declines without financial writes and cannot overwrite a concurrent approval', async () => {
  await new CreditService().decideApplication(customerId, applicationId, { approved: false });
  expect(prisma.customerCreditApplication.updateMany).toHaveBeenCalledWith({ where: { id: applicationId, customerId, status: 'Pending' }, data: expect.objectContaining({ status: 'Declined' }) });
  expect(prisma.payment.create).not.toHaveBeenCalled();
  expect(prisma.invoice.update).not.toHaveBeenCalled();
  (prisma.customerCreditApplication.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  await expect(new CreditService().decideApplication(customerId, applicationId, { approved: false })).rejects.toThrow('already been decided');
});

it('removes the independent hand-edit wallet path', async () => {
  await expect(new CreditService().adjustCredit({customerId, amount:10, recordedById:'staff'})).rejects.toThrow('derived');
  expect(prisma.customer.update).not.toHaveBeenCalled();
});

it('approves using a combination of receipt advance and opening credit',async()=>{
 (prisma.$queryRaw as jest.Mock).mockImplementation(async query=>{
  if(!query.sql.startsWith('SELECT * FROM ('))return query.sql.includes('AS amount') ? [{amount:new Prisma.Decimal(0)}] : [];
  if(query.sql.includes('FROM "Invoice"'))return [{...invoice,kind:'INVOICE',number:invoice.invoiceNumber,date:invoice.issuedDate,amount:invoice.total,balance:invoice.outstandingAmount}];
  return [{id:'receipt',kind:'RECEIPT',number:'001',date:new Date('2026-01-01'),amount:20,balance:20},{id:'opening',kind:'NOTE',number:'002',date:new Date('2026-01-02'),amount:20,balance:20}];
 });
 await new CreditService().decideApplication(customerId,applicationId,{approved:true});
 expect(prisma.receipt.update).toHaveBeenCalledWith({where:{id:'receipt'},data:{advanceAmount:0}});
 expect(prisma.partyNote.update).toHaveBeenCalledWith({where:{id:'opening'},data:{remainingAmount:new Prisma.Decimal(0)}});
 expect(prisma.receiptAllocation.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({receiptId:'receipt',amount:20}),expect.objectContaining({creditNoteId:'opening',amount:20})]});
 expect(prisma.customerCreditApplication.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'Approved',batchId:'batch'})}));
});
