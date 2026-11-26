import { createHash } from 'crypto';
import { z } from 'zod';
import { assertSignaturePng } from './estimate-signature';
import { checkInSnapshotSchema } from './job-check-in.logic';

export const SIGNED_OPENING_STATEMENT = 'I approve opening this job card for the vehicle and requests shown and accept the job card terms below. This signature does not approve an estimate or authorize repair costs. Estimate approval is separate.';
const text = z.string();
const openingScope = z.object({
  jobCardId: text, jobNumber: text, branchId: text, branchName: text,
  customerId: text.nullable(), customerName: text, vehicleId: text.nullable(),
  registration: text.nullable(), vin: text.nullable(), mileage: z.number().nullable(),
  openedAt: text, promisedAt: text.nullable(), service: text, description: text.nullable(),
  requests: z.array(z.object({ id: text, complaintCodeId: text.nullable(), defectCode: text.nullable(), description: text }).strict()),
}).strict();
const documentFields = { termsVersion: z.string().regex(/^[a-f0-9]{64}$/), statement: text, terms: z.array(text), footer: text.nullable() };
/** Version 1: signed before check-in existed. Kept so those signatures still verify and print. */
export const signedOpeningDocumentV1 = z.object({ version: z.literal(1), ...documentFields, scope: openingScope }).strict();
/** Version 2 (phase 2): the scope also holds the walk-around, so the evidence hash covers fuel, checklist, damage and belongings. */
export const signedOpeningDocumentV2 = z.object({
  version: z.literal(2), ...documentFields, scope: openingScope.extend({ checkIn: checkInSnapshotSchema }).strict(),
}).strict();
export const signedOpeningDocumentSchema = z.discriminatedUnion('version', [signedOpeningDocumentV1, signedOpeningDocumentV2]);
export type SignedOpeningDocument = z.infer<typeof signedOpeningDocumentSchema>;

export const openingSignatureBody = z.object({
  accepted: z.literal(true), expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(), signerName: z.string().trim().min(1, 'Enter the name of the person signing').max(200, 'Keep the name to 200 characters'),
  relationship: z.string().trim().max(200, 'Keep the relationship to 200 characters').optional(),
  signerPhone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter the phone number of the person signing, for example 0803 555 0142').optional(),
  signatureImage: z.string().max(88000, 'The signature is too large. Clear it and sign again'),
}).strict().superRefine((body, ctx) => {
  // A representative is identified by relationship and phone (terms clause 7: release only to the signer).
  if (body.relationship && !body.signerPhone)
    ctx.addIssue({ code: 'custom', path: ['signerPhone'], message: 'Enter the phone number of the person signing for the customer' });
});

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
  /** Null on owner signatures and on every signature taken before phase 2. */
  signerPhone?: string | null;
  capturedById: string; signedAt: Date; signatureImage: string;
};
/** The phone joins the hash only when recorded, so signatures taken before it existed keep their hash. */
export function openingEvidenceHash(evidence: OpeningEvidence): string {
  return openingHash({ documentHash: evidence.documentHash, signerName: evidence.signerName,
    relationship: evidence.relationship, capturedById: evidence.capturedById,
    signedAt: evidence.signedAt.toISOString(), signatureHash: openingHash(evidence.signatureImage),
    ...(evidence.signerPhone ? { signerPhone: evidence.signerPhone } : {}) });
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
