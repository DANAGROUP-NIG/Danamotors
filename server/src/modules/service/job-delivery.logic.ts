import { z } from "zod";
import { CHECKLIST_ITEMS, readChecklist, type ChecklistCode } from "./job-check-in.logic";
import { nigerianPhone, normalisePhone } from "./job-estimate.logic";
import { openingHash, sameSigner } from "./job-opening-signature.logic";

/**
 * Delivery (job card revamp phase 9): the advisor hands the vehicle over with the customer. Pure rules only;
 * job-delivery.service.ts does the database work.
 */

export const DELIVERY_STATEMENT = "I am taking delivery of the vehicle and I am satisfied with the repairs.";
export const PHONE_APPROVAL_STATEMENT =
  "I confirm that I approved this work on the phone, as listed, and I accept the estimate terms.";
/** The document version stored with each delivery signature. */
export const DELIVERY_DOCUMENT_VERSION = 1;

/**
 * Check-in checklist items the customer takes away, in the paper card's order. Fixtures such as headlamps or
 * the stereo stay on the car and are not "belongings". TODO(confirm): the list of returnable items.
 */
export const RETURNABLE_ITEMS: readonly ChecklistCode[] = [
  "SERVICE_BOOK",
  "REGISTRATION_DOCUMENTS",
  "JACK_AND_HANDLE",
  "TOOL_KIT",
  "FLOOR_MATS",
  "SPARE_WHEEL",
  "FIRE_EXTINGUISHER",
];
/** The code of the free-text belongings note from the walk-around ("Umbrella in boot"). */
export const BELONGINGS_NOTE = "BELONGINGS_NOTE";

export type Belonging = {
  code: string;
  label: string;
};

/** What to hand back: the returnable check-in items that were Present, then the belongings note. */
export function belongingsList(checklist: unknown, belongingsNote: string | null | undefined): Belonging[] {
  const states = readChecklist(checklist);
  const items: Belonging[] = CHECKLIST_ITEMS.filter((item) => RETURNABLE_ITEMS.includes(item.code) && states[item.code] === "PRESENT").map(
    (item) => ({ code: item.code, label: item.label }),
  );
  const note = belongingsNote?.trim();
  if (note) items.push({ code: BELONGINGS_NOTE, label: note });
  return items;
}

/** Belongings not ticked as returned, in list order. */
export function unreturnedBelongings(belongings: Belonging[], returned: readonly string[]): Belonging[] {
  const ticked = new Set(returned);
  return belongings.filter((item) => !ticked.has(item.code));
}

export const COLLECTOR_TYPES = ["OWNER", "CHECK_IN_SIGNER", "OTHER"] as const;
export type CollectorType = (typeof COLLECTOR_TYPES)[number];

export type Person = {
  name: string;
  phone: string | null;
};

export interface CollectorFacts {
  owner: Person;
  /** The person who signed the job card at check-in, when that was not the owner (a representative). */
  checkInSigner: Person | null;
  /** The latest manager approval to release the vehicle to someone else. */
  approval: Person | null;
}

/** The check-in signer, only when someone other than the owner signed. */
export function representativeSigner(signer: Person | null, ownerName: string): Person | null {
  return signer && !sameSigner(signer.name, ownerName) ? signer : null;
}

/** Who signs for the vehicle for each choice, or null when that choice is not possible yet. */
export function collectorFor(type: CollectorType, facts: CollectorFacts): Person | null {
  if (type === "OWNER") return facts.owner;
  if (type === "CHECK_IN_SIGNER") return facts.checkInSigner;
  return facts.approval;
}

export const RELEASE_RULE =
  "Terms clause 7: the vehicle is released only to the owner or the person who signed the job card. A service manager or workshop manager must approve releasing it to someone else, with a reason.";

/** Why this collector cannot take the vehicle, or null. */
export function collectorProblem(type: CollectorType | null, facts: CollectorFacts): string | null {
  if (!type) return "Choose who is collecting the vehicle.";
  if (type === "CHECK_IN_SIGNER" && !facts.checkInSigner)
    return "Nobody else signed the job card at check-in. Choose the owner or someone else.";
  if (type === "OTHER" && !facts.approval) return RELEASE_RULE;
  return null;
}

/** Delivered after the promised time: the existing late-delivery rule (assertTransition) needs 1 to 6 reasons. */
export function isLate(promisedAt: Date | null, now: Date): boolean {
  return !!promisedAt && now.getTime() > promisedAt.getTime();
}

export interface DeliveryFacts {
  /** Payment before delivery (deliveryPaymentProblem): unpaid balance, no invoice, or null. */
  paymentProblem: string | null;
  /** Estimate revisions the customer approved on the phone and has not signed yet. */
  phoneSignaturesDue: number;
  belongings: Belonging[];
  returned: readonly string[];
  collectorProblem: string | null;
  late: boolean;
  /** How many reasons were chosen, and the late-delivery reason check (reasonProblem), when late. */
  lateReasonCount: number;
  lateReasonProblem: string | null;
  signed: boolean;
}

export const LATE_REASONS_NEEDED = "The promised time has passed. Choose 1 to 6 reasons for late delivery.";

/** Everything that still stops the delivery, in the order the advisor works down the screen. */
export function deliveryProblems(facts: DeliveryFacts): string[] {
  const problems: string[] = [];
  if (facts.paymentProblem) problems.push(facts.paymentProblem);
  if (facts.phoneSignaturesDue > 0)
    problems.push("The customer must first sign the estimate they approved on the phone.");
  const missing = unreturnedBelongings(facts.belongings, facts.returned).length;
  if (missing)
    problems.push(
      missing === 1
        ? "Tick Returned for every belonging: 1 is not ticked yet."
        : `Tick Returned for every belonging: ${missing} are not ticked yet.`,
    );
  if (facts.collectorProblem) problems.push(facts.collectorProblem);
  if (facts.late && facts.lateReasonProblem)
    problems.push(facts.lateReasonCount === 0 ? LATE_REASONS_NEEDED : `Reasons for late delivery: ${facts.lateReasonProblem}`);
  if (!facts.signed) problems.push("The customer must sign to take delivery.");
  return problems;
}

export interface WorkLineFact {
  description: string;
  supplementary: boolean;
  payer: string;
}

export type WorkDoneLine = {
  text: string;
  /** Plain words for the customer, for example "Added with your approval". */
  note: string | null;
};

const PAYER_NOTE: Record<string, string> = {
  WARRANTY: "Covered by warranty, no charge to you",
  GOODWILL: "Covered by goodwill, no charge to you",
  CAMPAIGN: "Done under a manufacturer campaign, no charge to you",
};

/**
 * The work done, in plain words: each approved work line, noting extra work the customer approved during the
 * repair and work they do not pay for. Jobs from before the work list fall back to the advisor's work done text.
 */
export function workDoneLines(lines: WorkLineFact[], legacyText: string | null | undefined): WorkDoneLine[] {
  if (lines.length)
    return lines.map((line) => ({
      text: line.description,
      note: line.supplementary ? "Added with your approval" : (PAYER_NOTE[line.payer] ?? null),
    }));
  return (legacyText ?? "")
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text, note: null }));
}

export interface DeliveryDocumentInput {
  jobNumber: string;
  registration: string | null;
  workDone: WorkDoneLine[];
  declined: string[];
  belongings: Belonging[];
  collectorType: CollectorType;
  collector: Person;
  release: { approvedBy: string; reason: string } | null;
}

/** The signed delivery document. Its hash, the signer and the image make the evidence hash. */
export function deliveryDocument(input: DeliveryDocumentInput) {
  return {
    version: DELIVERY_DOCUMENT_VERSION,
    statement: DELIVERY_STATEMENT,
    jobNumber: input.jobNumber,
    registration: input.registration,
    workDone: input.workDone,
    declined: input.declined,
    belongings: input.belongings.map((item) => ({ ...item, returned: true })),
    collector: { type: input.collectorType, name: input.collector.name, phone: input.collector.phone },
    release: input.release,
  };
}
export type DeliveryDocument = ReturnType<typeof deliveryDocument>;

export interface DeliveryEvidence {
  documentHash: string;
  signerName: string;
  signerPhone: string | null;
  capturedById: string;
  signedAt: Date;
  signatureImage: string;
}

/** Binds the document, the signer, who captured it, when, and the image (as JobOpeningSignature does). */
export function deliveryEvidenceHash(evidence: DeliveryEvidence): string {
  return openingHash({
    documentHash: evidence.documentHash,
    signerName: evidence.signerName,
    signerPhone: evidence.signerPhone,
    capturedById: evidence.capturedById,
    signedAt: evidence.signedAt.toISOString(),
    signatureHash: openingHash(evidence.signatureImage),
  });
}

/** True when a stored delivery signature still matches its document and evidence. */
export function validDeliveryEvidence(evidence: DeliveryEvidence & { snapshot: unknown; evidenceHash: string }): boolean {
  return openingHash(evidence.snapshot) === evidence.documentHash && deliveryEvidenceHash(evidence) === evidence.evidenceHash;
}

const requestId = z.string({ required_error: "Reload the page and try again" }).uuid("Reload the page and try again");
const signatureImage = z
  .string({ required_error: "Ask the customer to sign in the box" })
  .min(1, "Ask the customer to sign in the box")
  .max(88000, "The signature is too large. Clear it and sign again");
const reasonId = z.string().uuid("Choose the reasons from the list");

export const deliveryBody = z
  .object({
    requestId,
    collectorType: z.enum(COLLECTOR_TYPES, { errorMap: () => ({ message: "Choose who is collecting the vehicle" }) }),
    returnedCodes: z.array(z.string().max(40)).max(40),
    lateReasonIds: z.array(reasonId).max(6, "Choose at most 6 reasons for late delivery").default([]),
    lateRemarks: z.string().trim().max(1000, "Keep the delay remark to 1,000 characters").optional(),
    accepted: z.literal(true, { errorMap: () => ({ message: "The customer must confirm the delivery statement" }) }),
    signatureImage,
  })
  .strict();
export type DeliveryInput = z.infer<typeof deliveryBody>;

export const phoneSignatureBody = z
  .object({
    requestId,
    signerName: z.string().trim().min(1, "Enter the name of the person signing").max(120, "Use at most 120 characters for the name"),
    accepted: z.literal(true, { errorMap: () => ({ message: "The customer must confirm the work they approved on the phone" }) }),
    signatureImage,
  })
  .strict();
export type PhoneSignatureInput = z.infer<typeof phoneSignatureBody>;

export const releaseApprovalBody = z
  .object({
    requestId,
    collectorName: z.string().trim().min(2, "Enter the full name of the person collecting").max(120, "Use at most 120 characters for the name"),
    collectorPhone: nigerianPhone.transform(normalisePhone),
    reason: z
      .string()
      .trim()
      .min(10, "Write why the vehicle can be released to this person (at least 10 characters)")
      .max(1000, "Use at most 1,000 characters for the reason"),
  })
  .strict();
export type ReleaseApprovalInput = z.infer<typeof releaseApprovalBody>;

export const releaseRequestBody = z
  .object({
    requestId,
    collectorName: z.string().trim().min(2, "Enter the full name of the person collecting").max(120, "Use at most 120 characters for the name"),
  })
  .strict();
export type ReleaseRequestInput = z.infer<typeof releaseRequestBody>;
