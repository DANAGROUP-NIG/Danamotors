import { createHash } from 'crypto';
import type { FindingPayer, LineDecision } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/appError';
import { estimateContentHashV2, estimateTotals } from './job-estimate.logic';

/** Numbers as stored: Prisma Decimal on rows, plain numbers in older callers and tests. */
type Num = number | { toString(): string };
export type SignedContent = {
  version?: number;
  upfrontPaymentPercent?: Num;
  currency?: string;
  amount: Num;
  vatRate?: Num;
  lines: { type: string; referenceId?: string | null; description: string; quantity: Num; rate: Num; amount: Num; payer?: FindingPayer; customerDecision?: LineDecision | null }[];
};

/** Version 1 hash: every line, no payers or decisions. Signatures taken before phase 5 keep verifying against it. */
export function estimateContentHash(estimate: SignedContent): string {
  const lines = estimate.lines.map(line => [line.type, line.referenceId ?? null, line.description, Number(line.quantity), Number(line.rate), Number(line.amount)]);
  lines.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  const percent = estimate.upfrontPaymentPercent;
  return createHash('sha256').update(JSON.stringify({ version: estimate.version ?? 1, currency: estimate.currency ?? 'NGN', total: Number(estimate.amount), ...(percent != null && Number(String(percent)) !== 60 ? { upfrontPaymentPercent: String(Number(String(percent))) } : {}), lines })).digest('hex');
}

/** Version 2 hash (the staged estimate): payers, the customer's line decisions and VAT included. */
export function stagedContentHash(estimate: SignedContent): string {
  return estimateContentHashV2({
    version: estimate.version ?? 1,
    currency: estimate.currency ?? 'NGN',
    vatRate: String(estimate.vatRate ?? 7.5),
    upfrontPaymentPercent: String(estimate.upfrontPaymentPercent ?? 60),
    lines: estimate.lines.map(line => ({ ...line, quantity: String(line.quantity), rate: String(line.rate), amount: String(line.amount), payer: line.payer ?? 'CUSTOMER', customerDecision: line.customerDecision ?? null })),
  });
}

/** What the customer agreed to pay, with VAT, on a staged estimate. */
export function approvedCustomerTotal(estimate: SignedContent): string {
  return estimateTotals(estimate.lines.map(line => ({ payer: line.payer ?? 'CUSTOMER', amount: String(line.amount), customerDecision: line.customerDecision ?? null })), String(estimate.vatRate ?? 7.5)).approvedTotal;
}

export function assertSignaturePng(image: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new BadRequestError('Sign in the box. A signature is required');
  const bytes = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  if (bytes.length > 65536 || bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(16) > 2048 || bytes.readUInt32BE(20) > 1024) throw new BadRequestError('The signature image is too large. Clear it and sign again');
}

export type SignatureEvidence = { estimateVersion: number; totalSigned: Num; contentHash: string; hashVersion?: number };
export type ApprovalEvidence = { signatureRequired?: boolean; overrideReason?: string | null; channel?: string; contentHash?: string | null; signature?: SignatureEvidence | null };

/**
 * valid: signed and the revision still matches what was signed. phone: approved by phone for this exact
 * content; the customer signs at delivery. override: an Admin recorded a reason instead of a signature.
 * legacy: an old decision that never needed a signature. invalid: anything else.
 */
export function signatureState(estimate: SignedContent, approval: ApprovalEvidence): 'valid' | 'invalid' | 'legacy' | 'override' | 'phone' {
  const signature = approval.signature;
  if (signature) {
    if (signature.estimateVersion !== (estimate.version ?? 1)) return 'invalid';
    if (signature.hashVersion === 2)
      return signature.contentHash === stagedContentHash(estimate) && Number(String(signature.totalSigned)) === Number(approvedCustomerTotal(estimate)) ? 'valid' : 'invalid';
    return Number(String(signature.totalSigned)) === Number(String(estimate.amount)) && signature.contentHash === estimateContentHash(estimate) ? 'valid' : 'invalid';
  }
  if (approval.channel === 'PHONE') return approval.contentHash === stagedContentHash(estimate) ? 'phone' : 'invalid';
  if (approval.overrideReason?.trim()) return 'override';
  return approval.signatureRequired === true ? 'invalid' : 'legacy';
}
