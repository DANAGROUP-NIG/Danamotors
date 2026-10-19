jest.mock('../../prisma/client', () => ({ __esModule: true, default: {
  $transaction: jest.fn(),
  branch: { findUnique: jest.fn() },
  documentTerms: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
} }));
import prisma from '../../prisma/client';
import { DocumentTermsService, saveTermsSchema } from './document-terms.service';

const branchId = '00000000-0000-4000-8000-000000000001';
const service = new DocumentTermsService();
const company = { id: 'c', terms: ['60% advance to be paid prior to commencement of job.'], footer: 'Cheques are subject to realisation.' };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
});

it('prints the company terms unless the branch has its own', async () => {
  (prisma.documentTerms.findFirst as jest.Mock).mockImplementation(({ where }) => Promise.resolve(where.branchId ? { id: 'b', terms: [], footer: 'Abuja footer' } : company));
  expect(await service.effective('JOB_ESTIMATE', branchId)).toEqual({ terms: company.terms, footer: 'Abuja footer' });
  (prisma.documentTerms.findFirst as jest.Mock).mockImplementation(({ where }) => Promise.resolve(where.branchId ? null : company));
  expect(await service.effective('JOB_ESTIMATE', branchId)).toEqual({ terms: company.terms, footer: company.footer });
});

it('updates the existing scope row instead of adding another', async () => {
  (prisma.documentTerms.findFirst as jest.Mock).mockResolvedValue(company);
  await service.save({ documentType: 'JOB_BILL', branchId: null, terms: ['A'], footer: '' });
  expect(prisma.documentTerms.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { terms: ['A'], footer: null } });
  expect(prisma.documentTerms.create).not.toHaveBeenCalled();
});

it('limits the number and length of terms', () => {
  const body = { documentType: 'JOB_BILL', branchId: null, footer: null };
  expect(saveTermsSchema.safeParse({ body: { ...body, terms: Array(21).fill('x') } }).success).toBe(false);
  expect(saveTermsSchema.safeParse({ body: { ...body, terms: ['x'.repeat(501)] } }).success).toBe(false);
  expect(saveTermsSchema.safeParse({ body: { ...body, documentType: 'INVOICE', terms: [] } }).success).toBe(false);
});
