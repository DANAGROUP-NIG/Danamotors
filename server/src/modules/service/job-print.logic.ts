import { CHECKLIST_ITEMS, readChecklist, type ChecklistState } from "./job-check-in.logic";

/**
 * The printed job card and gate pass (job card revamp phase 11): how the stored job becomes the
 * paper form's boxes. Pure functions; job-print.service.ts loads the data. Dates stay as dates and
 * money as decimal strings, so the client formats them with the shared Lagos and naira formatters.
 */

/** The authorisation sentence printed above the customer's check-in signature. */
export const AUTHORISATION_STATEMENT = "I authorise the work requested above and accept the terms and conditions overleaf.";
/** The delivery sentence printed above the customer's delivery signature (as signed at delivery). */
export const DELIVERY_STATEMENT = "I have taken delivery of the vehicle and I am satisfied with the repairs.";

export interface PrintChecklistRow {
  number: number;
  code: string;
  label: string;
  state: ChecklistState | null;
}

/** The 25 paper-card items in the paper card's order, with the state recorded at check-in (null when not checked). */
export function printChecklist(stored: unknown): PrintChecklistRow[] {
  const checklist = readChecklist(stored);
  return CHECKLIST_ITEMS.map((item, index) => ({ number: index + 1, code: item.code, label: item.label, state: checklist[item.code] ?? null }));
}

/** Non-empty trimmed lines: a multi-line note becomes one printed line per line. */
export function textLines(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface FindingFact {
  causeAndDefect: string;
  raisedDuringRepair: boolean;
  /** The customer request it answers, by position (0-based), or null when the customer did not mention it. */
  requestIndex: number | null;
  createdAt: Date;
}

export interface PrintFinding {
  text: string;
  /** "Request 2", "Found during the repair" or "Also found". */
  source: string;
}

/**
 * The paper card's "cause and nature of defect": the technician's findings in request order, then
 * findings the customer did not mention, then those raised during the repair. Empty findings are left out.
 */
export function printFindings(findings: FindingFact[]): PrintFinding[] {
  const rank = (finding: FindingFact) => (finding.raisedDuringRepair ? 2 : finding.requestIndex === null ? 1 : 0);
  return findings
    .filter((finding) => finding.causeAndDefect.trim())
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.requestIndex ?? 0) - (b.requestIndex ?? 0) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .map((finding) => ({
      text: finding.causeAndDefect.trim(),
      source: finding.raisedDuringRepair
        ? "Found during the repair"
        : finding.requestIndex === null
          ? "Also found"
          : `Request ${finding.requestIndex + 1}`,
    }));
}

/** The JOB_CARD terms numbered for the back page. Blank clauses are dropped and the rest renumbered. */
export function numberedTerms(terms: string[]): { number: number; text: string }[] {
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((text, index) => ({ number: index + 1, text }));
}

export type SignatureBoxKey = "SERVICE_ADVISOR" | "TECHNICIAN" | "SERVICE_MANAGER" | "CUSTOMER_AUTHORISATION" | "CUSTOMER_DELIVERY";

export interface SignatureBox {
  key: SignatureBoxKey;
  title: string;
  statement: string | null;
  /** The printed name under the line; null leaves the name line blank. */
  name: string | null;
  /** "Representative, Brother" when someone signed for the customer. */
  capacity: string | null;
  date: Date | null;
  /** The captured signature (PNG data URL); null prints a blank signature line. */
  image: string | null;
  /** A plain sentence when the signature needs a caution, for example details changed after signing. */
  note: string | null;
}

export interface StaffSign {
  name: string | null;
  at: Date | null;
}

export interface CustomerSign {
  name: string;
  relationship: string | null;
  at: Date;
  image: string;
}

export interface SignatureFacts {
  advisor: StaffSign;
  technician: StaffSign;
  /** The quality check certification ("checked and certified roadworthy"), with its signature when captured. */
  certifier: (StaffSign & { image: string | null }) | null;
  /** The latest check-in consent signature and whether it still matches the job. */
  authorisation: (CustomerSign & { state: "signed" | "stale" | "invalid" }) | null;
  delivery: CustomerSign | null;
}

const capacity = (relationship: string | null) => (relationship?.trim() ? `Representative, ${relationship.trim()}` : null);

/**
 * The paper card's five signature boxes. Staff boxes print the person's name and the date they did
 * the step; customer boxes print the signature they drew in the app. A box with nothing captured
 * prints blank lines for a pen signature.
 * TODO(confirm): the "Service manager" box carries the quality check certification (the paper card's
 * "checked and certified roadworthy"), which the workshop supervisor or quality inspector signs.
 */
export function signatureBoxes(facts: SignatureFacts): SignatureBox[] {
  const staff = (key: SignatureBoxKey, title: string, sign: StaffSign | null, image: string | null = null): SignatureBox => ({
    key,
    title,
    statement: null,
    name: sign?.name?.trim() || null,
    capacity: null,
    date: sign?.at ?? null,
    image,
    note: null,
  });
  const auth = facts.authorisation;
  const authNote =
    auth?.state === "invalid"
      ? "The signature could not be verified. Ask the customer to sign the printed copy."
      : auth?.state === "stale"
        ? "Details changed after the customer signed."
        : null;
  return [
    staff("SERVICE_ADVISOR", "Service advisor", facts.advisor),
    staff("TECHNICIAN", "Technician", facts.technician),
    staff("SERVICE_MANAGER", "Service manager", facts.certifier, facts.certifier?.image ?? null),
    {
      key: "CUSTOMER_AUTHORISATION",
      title: "Customer authorisation",
      statement: AUTHORISATION_STATEMENT,
      name: auth?.name.trim() || null,
      capacity: auth ? capacity(auth.relationship) : null,
      date: auth?.at ?? null,
      // An unverifiable signature is not printed as if it were valid.
      image: auth && auth.state !== "invalid" ? auth.image : null,
      note: authNote,
    },
    {
      key: "CUSTOMER_DELIVERY",
      title: "Customer delivery",
      statement: DELIVERY_STATEMENT,
      name: facts.delivery?.name.trim() || null,
      capacity: null,
      date: facts.delivery?.at ?? null,
      image: facts.delivery?.image ?? null,
      note: null,
    },
  ];
}

/** The technician's sign-off: the last time the work was sent for quality check, by whom. */
export function technicianSignOff(
  events: { action: string | null; actorName: string | null; at: Date }[],
  assignedName: string | null,
): StaffSign {
  const sent = [...events].filter((event) => event.action === "SEND_TO_QC").sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  return { name: sent?.actorName ?? assignedName, at: sent?.at ?? null };
}

/** The customer's address on one line, skipping empty parts and repeats ("14 Admiralty Way, Lekki, Lagos"). */
export function addressLine(parts: (string | null | undefined)[]): string | null {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    kept.push(value);
  }
  return kept.length ? kept.join(", ") : null;
}
