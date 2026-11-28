import type { ComparisonRow } from "./job-billing.types";
import type { ChecklistState, DamageType, FuelLevel } from "./job-check-in.types";

/** GET /service/job-cards/:id/print: the paper job card filled from the stored job (phase 11). */
export interface JobCardPrintData {
  company: { name: string };
  branch: { name: string; address: string | null; phone: string | null };
  job: {
    id: string;
    number: string;
    openedAt: string;
    mileage: number | null;
    warranty: boolean;
    advisor: string | null;
    promisedAt: string | null;
    deliveredAt: string | null;
    gatePassNumber: string | null;
  };
  customer: { name: string | null; phone: string | null; address: string | null } | null;
  vehicle: {
    make: string | null;
    model: string | null;
    year: number | null;
    colour: string | null;
    registration: string | null;
    vin: string | null;
    engineNumber: string | null;
    soldBy: string | null;
    soldOn: string | null;
  } | null;
  requests: string[];
  instructions: { advisor: string[]; supervisor: string[] };
  damageMarks: { id: string; type: DamageType; x: number; y: number; note: string | null }[];
  fuelLevel: FuelLevel | null;
  checklist: { number: number; code: string; label: string; state: ChecklistState | null }[];
  checklistNote: string | null;
  findings: { text: string; source: string }[];
  findingsConfirmed: { by: string | null; at: string } | null;
  roadworthy: { by: string | null; at: string } | null;
  comparison: { rows: ComparisonRow[] | null; problem: string | null };
  signatures: PrintSignatureBox[];
  previousVisits: { jobNumber: string; date: string; mileage: number | null; work: string | null }[];
  terms: { number: number; text: string }[];
  termsFooter: string | null;
  printedAt: string;
}

export interface PrintSignatureBox {
  key: "SERVICE_ADVISOR" | "TECHNICIAN" | "SERVICE_MANAGER" | "CUSTOMER_AUTHORISATION" | "CUSTOMER_DELIVERY";
  title: string;
  statement: string | null;
  name: string | null;
  capacity: string | null;
  date: string | null;
  image: string | null;
  note: string | null;
}

/** GET /service/job-cards/:id/print/gate-pass: the A6 slip. */
export interface GatePassPrintData {
  company: { name: string };
  branch: { name: string };
  jobNumber: string;
  gatePassNumber: string;
  registration: string | null;
  vin: string | null;
  vehicle: { make: string | null; model: string | null; year: number | null; colour: string | null } | null;
  customer: string | null;
  collectedBy: string | null;
  deliveredBy: string | null;
  deliveredAt: string | null;
  printedAt: string;
}
