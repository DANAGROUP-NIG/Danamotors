jest.mock('../../prisma/client', () => ({ __esModule: true, default: { $transaction: jest.fn() } }));
import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { loadOpeningConsent, openingConsentDocument, recordOpeningConsent } from './job-opening-consent';
import { JobCardWorkflowService } from './job-card-workflow.service';
import { jobOpeningBody } from './service.validation';

const id = '00000000-0000-4000-8000-000000000001';
const booking = { id, customerId: id, vehicleId: id, branchId: id, updatedAt: new Date('2026-11-11T09:00:00Z') };
const terms = { terms: ['Opening this record does not approve repair charges.'], footer: 'Separate estimate approval follows.' };
const opening = { appointmentId: id, customerId: id, vehicleId: id, branchName: 'Test branch', serviceTypeId: id, bayId: id, serviceAdvisorId: id, teamId: id, description: 'Inspect brakes', mileage: 100, promisedAt: '2026-11-12T15:00:00Z', complaints: [{ description: 'Inspect brakes' }] };

it('requires conversion consent before acquiring a transaction and does not accept an estimate signature instead', async () => {
  expect(jobOpeningBody.safeParse(opening).success).toBe(false);
  await expect(new JobCardWorkflowService().open({ ...opening, createdById: id })).rejects.toThrow('job opening terms');
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(() => recordOpeningConsent(openingConsentDocument(booking, terms), { signatureImage: 'estimate-signature', consentAccepted: true }, id)).toThrow('job opening terms');
});

it('records checkbox acceptance separately with server time, actor, booking identity and exact terms', () => {
  const document = openingConsentDocument(booking, terms);
  const proof = { accepted: true, termsHash: document.termsHash };
  expect(jobOpeningBody.safeParse({ ...opening, openingConsent: proof }).success).toBe(true);
  const snapshot = recordOpeningConsent(document, proof, 'actor', new Date('2026-11-11T09:30:00Z'));
  expect(snapshot).toMatchObject({ documentType: 'JOB_CARD', source: 'BOOKING_CONVERSION', accepted: true, acceptedAt: '2026-11-11T09:30:00.000Z', capturedById: 'actor', appointmentId: id, terms: terms.terms });
  expect(snapshot).not.toHaveProperty('signatureImage');
  expect(snapshot).not.toHaveProperty('approvalId');
  expect(snapshot.statement).toContain('does not approve an estimate');
});

it('rejects unchecked consent and stale terms or changed appointment identity/version', () => {
  const document = openingConsentDocument(booking, terms);
  expect(() => recordOpeningConsent(document, { accepted: false, termsHash: document.termsHash }, 'actor')).toThrow('Accept');
  const proof = { accepted: true, termsHash: document.termsHash };
  for (const changed of [
    openingConsentDocument(booking, { ...terms, terms: ['Revised terms'] }),
    openingConsentDocument(booking, { ...terms, footer: 'Revised footer' }),
    ...['id', 'customerId', 'vehicleId', 'branchId'].map(key => openingConsentDocument({ ...booking, [key]: 'changed' }, terms)),
    openingConsentDocument({ ...booking, updatedAt: new Date('2026-11-11T10:00:00Z') }, terms),
  ]) expect(() => recordOpeningConsent(changed, proof, 'actor')).toThrow('changed');
});

it('loads JOB_CARD terms with the existing branch/company fallback inside the supplied transaction', async () => {
  const findFirst = jest.fn().mockImplementation(({ where }: { where: { branchId: string | null } }) => Promise.resolve(where.branchId ? { terms: [], footer: 'Branch footer' } : terms));
  const tx = { documentTerms: { findFirst } } as unknown as Prisma.TransactionClient;
  const document = await loadOpeningConsent(tx, booking);
  expect(document.terms).toEqual(terms.terms);
  expect(document.footer).toBe('Branch footer');
  expect(findFirst).toHaveBeenCalledWith({ where: { documentType: 'JOB_CARD', branchId: id } });
});
