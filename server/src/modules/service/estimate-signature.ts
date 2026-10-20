import { createHash } from 'crypto';
import { BadRequestError } from '../../shared/errors/appError';
export type SignedContent = { version?: number; currency?: string; amount: number; lines: {type:string;referenceId?:string|null;description:string;quantity:number;rate:number;amount:number}[] };
export function estimateContentHash(estimate: SignedContent): string {
 const lines = estimate.lines.map(line => [line.type,line.referenceId ?? null,line.description,line.quantity,line.rate,line.amount]);
 lines.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
 return createHash('sha256').update(JSON.stringify({version:estimate.version ?? 1,currency:estimate.currency ?? 'NGN',total:estimate.amount,lines})).digest('hex');
}
export function assertSignaturePng(image: string) {
 if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new BadRequestError('A PNG signature is required');
 const bytes=Buffer.from(image.slice(image.indexOf(',')+1),'base64');
 if(bytes.length > 65536 || bytes.length < 33 || bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii',12,16) !== 'IHDR' || bytes.readUInt32BE(16) > 2048 || bytes.readUInt32BE(20) > 1024) throw new BadRequestError('Signature PNG must be at most 64 KiB and 2048 by 1024 pixels');
}
export type SignatureEvidence = { estimateVersion:number;totalSigned:number;contentHash:string };
export function signatureState(estimate: SignedContent, approval: { signatureRequired?:boolean;overrideReason?:string|null;signature?:SignatureEvidence|null }): 'valid'|'invalid'|'legacy'|'override' {
 if (approval.signature) return approval.signature.estimateVersion === (estimate.version ?? 1) && approval.signature.totalSigned === estimate.amount && approval.signature.contentHash === estimateContentHash(estimate) ? 'valid' : 'invalid';
 if (approval.overrideReason?.trim()) return 'override';
 return approval.signatureRequired === true ? 'invalid' : 'legacy';
}
