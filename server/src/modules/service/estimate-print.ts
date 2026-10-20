import { signatureState, type SignedContent, type SignatureEvidence } from './estimate-signature';
type PrintEstimate = SignedContent & { id:string; estimateNumber:string|null; estimateDate:Date|null; createdAt:Date; description:string; status:string; successor:{version:number}|null; approvals: {approved:boolean|null; signatureRequired:boolean;overrideReason:string|null;signature:(SignatureEvidence & {imageReference:string;signerName:string;signedAt:Date;relationship:string|null})|null}[] };
/** Explicit customer-facing projection: never serialize the repository object into a print response. */
export function projectEstimatePrint(estimate:PrintEstimate, codes:Map<string,string>) {
 const approval=estimate.approvals.find(a=>a.signature) ?? estimate.approvals[0];
 const state=approval ? signatureState(estimate,approval) : null;
 const signature=approval?.signature;
 return { id:estimate.id,version:estimate.version ?? 1,estimateNumber:estimate.estimateNumber,estimateDate:estimate.estimateDate ?? estimate.createdAt,currency:estimate.currency ?? 'NGN',total:estimate.amount,
  supersededBy:estimate.successor?.version ?? null,
  lines:estimate.lines.filter(line=>line.type!=='COMPLAINT').map(line=>({type:line.type.replace('INCLUDED_',''),code:codes.get(line.referenceId ?? '') ?? '',description:line.description,quantity:line.quantity,rate:line.rate,amount:line.amount})),
  signatureState:state,
  signature: signature ? {imageReference:signature.imageReference,signerName:signature.signerName,relationship:signature.relationship,signedAt:signature.signedAt,estimateVersion:signature.estimateVersion,totalSigned:signature.totalSigned} : null,
 };
}
