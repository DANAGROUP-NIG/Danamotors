import { createHash } from 'crypto';
import { z } from 'zod';
import { assertSignaturePng } from './estimate-signature';

export const SIGNED_OPENING_STATEMENT = 'I approve opening this job card for the vehicle and requests shown and accept the job card terms below. This signature does not approve an estimate or authorize repair costs. Estimate approval is separate.';
const text = z.string();
export const signedOpeningDocumentSchema = z.object({
  version: z.literal(1), termsVersion: z.string().regex(/^[a-f0-9]{64}$/), statement: text, terms: z.array(text), footer: text.nullable(),
  scope: z.object({
    jobCardId: text, jobNumber: text, branchId: text, branchName: text,
    customerId: text.nullable(), customerName: text, vehicleId: text.nullable(),
    registration: text.nullable(), vin: text.nullable(), mileage: z.number().nullable(),
    openedAt: text, promisedAt: text.nullable(), service: text, description: text.nullable(),
    requests: z.array(z.object({ id: text, complaintCodeId: text.nullable(), defectCode: text.nullable(), description: text }).strict()),
  }).strict(),
}).strict();
export type SignedOpeningDocument = z.infer<typeof signedOpeningDocumentSchema>;

export const openingSignatureBody = z.object({
  accepted: z.literal(true), expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(), signerName: z.string().trim().min(1).max(200),
  relationship: z.string().trim().max(200).optional(), signatureImage: z.string().max(88000),
}).strict();

export function openingHash(value: unknown): string {
  const canonical = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') return Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical((input as Record<string, unknown>)[key])]));
    return input;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export type OpeningEvidence = {
  documentHash: string; signerName: string; relationship: string | null;
  capturedById: string; signedAt: Date; signatureImage: string;
};
export function openingEvidenceHash(evidence: OpeningEvidence): string {
  return openingHash({ documentHash: evidence.documentHash, signerName: evidence.signerName,
    relationship: evidence.relationship, capturedById: evidence.capturedById,
    signedAt: evidence.signedAt.toISOString(), signatureHash: openingHash(evidence.signatureImage) });
}

export function validOpeningEvidence(evidence: OpeningEvidence & { snapshot: unknown; scopeHash: string; evidenceHash: string }): boolean {
  const parsed = signedOpeningDocumentSchema.safeParse(evidence.snapshot);
  if (!parsed.success) return false;
  try { assertSignaturePng(evidence.signatureImage); } catch { return false; }
  return openingHash({ statement: parsed.data.statement, terms: parsed.data.terms, footer: parsed.data.footer }) === parsed.data.termsVersion && openingHash(parsed.data) === evidence.documentHash && openingHash(parsed.data.scope) === evidence.scopeHash && openingEvidenceHash(evidence) === evidence.evidenceHash;
}

export function sameSigner(name: string, customer: string): boolean {
  const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized(name) === normalized(customer);
}
