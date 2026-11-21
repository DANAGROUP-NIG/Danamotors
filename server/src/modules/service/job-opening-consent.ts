import { createHash } from 'crypto';
import { Prisma, ServiceAppointment } from '@prisma/client';
import { z } from 'zod';
import { DocumentTermsService } from '../document-terms/document-terms.service';
import { BadRequestError, ConflictError } from '../../shared/errors/appError';

export const openingConsentProof = z.object({
  accepted: z.literal(true),
  termsHash: z.string().regex(/^[a-f0-9]{64}$/, 'Review the job opening terms again'),
}).strict();

type BookingIdentity = Pick<ServiceAppointment, 'id' | 'customerId' | 'vehicleId' | 'branchId' | 'updatedAt'>;
// TODO(confirm): configure company/branch JOB_CARD terms. This baseline permits
// opening the administrative job record only, without approving repair costs.
export const OPENING_CONSENT_STATEMENT = 'I consent to opening a job card for this appointment and accept the job card terms below. This consent does not approve an estimate or authorize repair work; estimate approval is separate.';

export function openingConsentDocument(booking: BookingIdentity, terms: { terms: string[]; footer: string | null }) {
  const content = {
    documentType: 'JOB_CARD', appointmentId: booking.id, customerId: booking.customerId,
    vehicleId: booking.vehicleId, branchId: booking.branchId, bookingVersion: booking.updatedAt.toISOString(),
    statement: OPENING_CONSENT_STATEMENT, terms: terms.terms, footer: terms.footer,
  };
  return { ...content, termsHash: createHash('sha256').update(JSON.stringify(content)).digest('hex') };
}

export async function loadOpeningConsent(tx: Prisma.TransactionClient, booking: BookingIdentity) {
  const terms = await new DocumentTermsService().effective('JOB_CARD', booking.branchId, tx);
  return openingConsentDocument(booking, terms);
}

export function recordOpeningConsent(document: ReturnType<typeof openingConsentDocument>, proof: unknown, capturedById: string, now = new Date()) {
  const consent = openingConsentProof.safeParse(proof);
  if (!consent.success) throw new BadRequestError('Accept the job opening terms before converting this appointment');
  if (consent.data.termsHash !== document.termsHash) throw new ConflictError('The appointment or job opening terms changed; review the consent again');
  return { ...document, accepted: true, acceptedAt: now.toISOString(), capturedById, source: 'BOOKING_CONVERSION' } satisfies Prisma.InputJsonObject;
}
