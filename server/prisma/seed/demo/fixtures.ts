/**
 * Dummy data for the Demo account. Everything here is invented: names, phone numbers
 * (+234 809 990 01xx), e-mail addresses (demo.danamotors.test, a reserved .test domain),
 * registrations and VINs. Nothing is copied from the legacy databases; they were used only
 * to decide what realistic records look like (Kia service and repair jobs, original and
 * local parts, coded labour, VIN-ranged bulletins).
 *
 * Dates are day offsets from the day the seed runs, so warranty and campaign cases do not
 * go stale.
 */
import { createHash } from "crypto";
import type { NotAttendedReason } from "../../../src/modules/campaign/campaign.logic";

export const DEMO_TAG = "DEMO-SEED";
export const TEST_PREFIX = "TEST-";

/** Immutable key stored in JobCard.customField1 (set at opening, never updatable). */
export const jobKey = (id: string) => `${DEMO_TAG}/${id}`;

/** Stable UUID for idempotency keys (receipts, opening balances). */
export function demoUuid(name: string) {
  const hex = createHash("sha256").update(`${DEMO_TAG}:${name}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type BranchKey = "main" | "second";

// ── Parties ──────────────────────────────────────────────────────────────────

export interface CustomerFixture {
  code: string;
  type: "INDIVIDUAL" | "CORPORATE";
  salutation?: "Mr." | "Mrs." | "Ms.";
  firstName: string;
  lastName: string;
  companyName?: string;
  contactPerson?: string;
  phoneNumber: string;
  email: string;
  address: string;
  city: string;
  state: string;
  branch: BranchKey;
  creditDays?: number;
  /** Money held on account (an opening credit note). */
  openingCredit?: number;
}

export const CUSTOMERS = {
  adeyemi: {
    code: "DEMO-C01", type: "INDIVIDUAL", salutation: "Mr.", firstName: "Tobi", lastName: "Adeyemi",
    phoneNumber: "+2348099900101", email: "tobi.adeyemi@demo.danamotors.test",
    address: "14 Sample Close, Ikeja", city: "Lagos", state: "Lagos", branch: "main",
  },
  garba: {
    code: "DEMO-C02", type: "INDIVIDUAL", salutation: "Mrs.", firstName: "Zainab", lastName: "Garba",
    phoneNumber: "+2348099900102", email: "zainab.garba@demo.danamotors.test",
    address: "7 Example Crescent, Wuse 2", city: "Abuja", state: "FCT", branch: "second", openingCredit: 50_000,
  },
  lakeside: {
    code: "DEMO-C03", type: "CORPORATE", firstName: "Lakeside Courier", lastName: "Services Ltd",
    companyName: "Lakeside Courier Services Ltd", contactPerson: "Fleet Desk (demo)",
    phoneNumber: "+2348099900103", email: "fleet@lakeside-courier.demo.danamotors.test",
    address: "22 Placeholder Road, Apapa", city: "Lagos", state: "Lagos", branch: "main", creditDays: 30,
  },
  // Staged job card demo jobs (job card revamp). Fictional.
  okafor: {
    code: "DEMO-C05", type: "INDIVIDUAL", salutation: "Ms.", firstName: "Adaeze", lastName: "Okafor",
    phoneNumber: "+2348099900105", email: "adaeze.okafor@demo.danamotors.test",
    address: "3 Sample Avenue, Isolo", city: "Lagos", state: "Lagos", branch: "main",
  },
  test1: {
    code: "TEST-C01", type: "INDIVIDUAL", firstName: "TEST-Warranty", lastName: "Customer One",
    phoneNumber: "+2348099900191", email: "test.warranty1@demo.danamotors.test",
    address: "Test data only", city: "Lagos", state: "Lagos", branch: "main",
  },
  test2: {
    code: "TEST-C02", type: "INDIVIDUAL", firstName: "TEST-Warranty", lastName: "Customer Two",
    phoneNumber: "+2348099900192", email: "test.warranty2@demo.danamotors.test",
    address: "Test data only", city: "Abuja", state: "FCT", branch: "second",
  },
} satisfies Record<string, CustomerFixture>;

export type CustomerKey = keyof typeof CUSTOMERS;

// ── Vehicle catalogue and warranty policies ──────────────────────────────────

/** Workshop catalogue (MODEL > VARIANT, COLOUR). Service charges and labour rates hang off the MODEL. */
export const WORKSHOP_MODELS = {
  RIO: { model: { code: "RIO", description: "Rio" }, variant: { code: "RIO-AT", description: "Rio automatic petrol" }, colour: { code: "RIO-W", description: "White" } },
  SPORTAGE: { model: { code: "SPORTAGE", description: "Sportage" }, variant: { code: "SPORTAGE-AT", description: "Sportage 2.0 automatic petrol" }, colour: { code: "SPORTAGE-G", description: "Gravity grey" } },
  SORENTO: { model: { code: "SORENTO", description: "Sorento" }, variant: { code: "SORENTO-AT", description: "Sorento 2.4 automatic petrol" }, colour: { code: "SORENTO-B", description: "Aurora black" } },
} as const;

export type WorkshopModelKey = keyof typeof WORKSHOP_MODELS;

/** Warranty policies (same codes as prisma/seed/warranty.ts). */
export const WARRANTY_MODELS = {
  RIO: { code: "KIA-RIO", name: "Rio", warrantyDays: 1095, warrantyKm: 100_000 },
  SPORTAGE: { code: "KIA-SPG", name: "Sportage", warrantyDays: 1825, warrantyKm: 100_000 },
  SORENTO: { code: "KIA-SRN", name: "Sorento", warrantyDays: 1825, warrantyKm: 100_000 },
} as const satisfies Record<WorkshopModelKey, unknown>;

export interface VehicleFixture {
  vin: string;
  registrationNumber: string;
  customer: CustomerKey;
  model: WorkshopModelKey;
  /** Sale date = run date minus this many days; the warranty starts on it. */
  saleDaysAgo: number;
}

export const VEHICLES = {
  // Sold about 14 months ago: inside the 5-year Sportage warranty, and in the open recall.
  sportage: { vin: "KNAPX81DMR7000101", registrationNumber: "KJA-101DM", customer: "lakeside", model: "SPORTAGE", saleDaysAgo: 420 },
  // Sold about 8 months ago: inside the 3-year Rio warranty.
  rio: { vin: "KNADN51DMS7000201", registrationNumber: "ABJ-202DM", customer: "garba", model: "RIO", saleDaysAgo: 240 },
  // Sold about 6.5 years ago: the 5-year warranty has expired by date.
  sorento: { vin: "KNAPM81DMK7000301", registrationNumber: "LSR-303DM", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2400 },
  test1: { vin: "KNAPX81DMS7000901", registrationNumber: "TEST-WTY-01", customer: "test1", model: "SPORTAGE", saleDaysAgo: 150 },
  test2: { vin: "KNADN51DMS7000902", registrationNumber: "TEST-WTY-02", customer: "test2", model: "RIO", saleDaysAgo: 120 },
  // FPC bulletin (#98): Sorentos in one VIN range, out of warranty so no warranty cases open.
  fpcCall: { vin: "KNAKU81DMC5000401", registrationNumber: "LSR-401FP", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2300 },
  fpcLetter: { vin: "KNAKU81DMC5000402", registrationNumber: "ABJ-402FP", customer: "garba", model: "SORENTO", saleDaysAgo: 2300 },
  fpcSkipped: { vin: "KNAKU81DMC5000403", registrationNumber: "APP-403FP", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2300 },
  fpcDone: { vin: "KNAKU81DMC5000404", registrationNumber: "LSR-404FP", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2300 },
  fpcWalkIn: { vin: "KNAKU81DMC5000405", registrationNumber: "ABJ-405FP", customer: "garba", model: "SORENTO", saleDaysAgo: 2300 },
  fpcAtQc: { vin: "KNAKU81DMC5000406", registrationNumber: "APP-406FP", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2300 },
  // Staged job card: one vehicle per step. The two Sportages are in warranty; the Sorentos are not.
  stgCheckIn: { vin: "KNAPX81DMS7000501", registrationNumber: "KJA-482TX", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 300 },
  stgAssign: { vin: "KNAPM81DMK7000502", registrationNumber: "LSR-512ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2200 },
  stgFindings: { vin: "KNAPM81DMK7000503", registrationNumber: "LSR-513ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  stgWarranty: { vin: "KNAPX81DMS7000504", registrationNumber: "KJA-514ST", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 600 },
  stgEstimate: { vin: "KNAPM81DMK7000505", registrationNumber: "LSR-515ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  stgParts: { vin: "KNAPM81DMK7000506", registrationNumber: "LSR-516ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  stgQc: { vin: "KNAPM81DMK7000507", registrationNumber: "LSR-517ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2200 },
  stgBilling: { vin: "KNAPM81DMK7000508", registrationNumber: "LSR-518ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  stgDelivery: { vin: "KNAPM81DMK7000509", registrationNumber: "LSR-519ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2200 },
  stgCancelled: { vin: "KNAPM81DMK7000510", registrationNumber: "LSR-520ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  // Check-in (phase 2): walk-around done and waiting for the customer to sign; signed and ready to hand on; a booking to open.
  stgConsent: { vin: "KNAPX81DMS7000511", registrationNumber: "KJA-521ST", customer: "adeyemi", model: "SPORTAGE", saleDaysAgo: 400 },
  stgSigned: { vin: "KNAPM81DMK7000512", registrationNumber: "LSR-522ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  stgBooking: { vin: "KNAPX81DMS7000513", registrationNumber: "KJA-523ST", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 500 },
  // Diagnosis (phase 3): out of warranty, so only a "possible warranty" flag sends a job to the warranty officer.
  stgReview: { vin: "KNAPM81DMK7000514", registrationNumber: "LSR-524ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  stgReturned: { vin: "KNAPM81DMK7000515", registrationNumber: "LSR-525ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  stgPlain: { vin: "KNAPM81DMK7000516", registrationNumber: "LSR-526ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2200 },
  // Warranty check (phase 4): service histories in warranty-check.ts. One missed service; regular and in the
  // open recall; no sale date recorded (cleared before its job opens).
  stgWtyIrregular: { vin: "KNAPX81DMS7000517", registrationNumber: "KJA-527ST", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 600 },
  stgWtyRegular: { vin: "KNAPX81DMS7000518", registrationNumber: "KJA-528ST", customer: "lakeside", model: "SPORTAGE", saleDaysAgo: 250 },
  stgWtyNoSale: { vin: "KNAPX81DMS7000519", registrationNumber: "KJA-529ST", customer: "adeyemi", model: "SPORTAGE", saleDaysAgo: 300 },
  // Estimate and approval (phase 5): in warranty with AC items on warranty; out of warranty for phone approval
  // and for a customer who declines everything; a free service with a warranty repair (no advance needed).
  stgEstPrepare: { vin: "KNAPX81DMS7000520", registrationNumber: "KJA-530ST", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 60 },
  stgEstPhone: { vin: "KNAPM81DMK7000521", registrationNumber: "LSR-531ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  stgEstDecline: { vin: "KNAPM81DMK7000522", registrationNumber: "LSR-532ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  stgEstFree: { vin: "KNAPX81DMS7000523", registrationNumber: "KJA-533ST", customer: "lakeside", model: "SPORTAGE", saleDaysAgo: 40 },
  // Repair (phase 6): work in progress with parts to collect (in warranty, the AC on warranty); a new
  // finding waiting for the supplementary estimate; a supplementary estimate waiting for the customer.
  stgRepairWork: { vin: "KNAPX81DMS7000524", registrationNumber: "KJA-534ST", customer: "okafor", model: "SPORTAGE", saleDaysAgo: 90 },
  stgRepairFinding: { vin: "KNAPM81DMK7000525", registrationNumber: "LSR-535ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2200 },
  stgRepairSupp: { vin: "KNAPM81DMK7000526", registrationNumber: "LSR-536ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2200 },
  // Quality check (phase 7): all work done and waiting for the check; failed and returned to the
  // technician; repaired after a failed check and back for a second check.
  stgQcReady: { vin: "KNAPM81DMK7000527", registrationNumber: "LSR-537ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2300 },
  stgQcReturned: { vin: "KNAPM81DMK7000528", registrationNumber: "LSR-538ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2250 },
  stgQcSecond: { vin: "KNAPM81DMK7000529", registrationNumber: "LSR-539ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2400 },
  // Billing (phase 8): quality check passed, not yet marked ready; ready four days ago (storage due);
  // invoiced and unpaid after the advance; invoiced and unpaid for a credit approval.
  stgBillReady: { vin: "KNAPM81DMK7000530", registrationNumber: "LSR-540ST", customer: "okafor", model: "SORENTO", saleDaysAgo: 2350 },
  stgBillStorage: { vin: "KNAPM81DMK7000531", registrationNumber: "LSR-541ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2280 },
  stgBillUnpaid: { vin: "KNAPM81DMK7000532", registrationNumber: "LSR-542ST", customer: "adeyemi", model: "SORENTO", saleDaysAgo: 2420 },
  stgBillCredit: { vin: "KNAPM81DMK7000533", registrationNumber: "LSR-543ST", customer: "lakeside", model: "SORENTO", saleDaysAgo: 2310 },
} satisfies Record<string, VehicleFixture>;

export type VehicleKey = keyof typeof VEHICLES;

// ── Parts and labour ─────────────────────────────────────────────────────────

export interface PartFixture {
  partNumber: string;
  name: string;
  category: string;
  /** Source of purchase: O original (genuine Kia), L local. Never printed for the customer. */
  partFlag: "O" | "L";
  /** S spare part, O oil. */
  partType: "S" | "O";
  uom: string;
  unitPrice: number;
  retailRate: number;
  warrantyApplicable: boolean;
  warrantyRate?: number;
  /** Opening stock and minimum level per branch. Issues on the seeded job cards are taken from it. */
  stock: Record<BranchKey, { quantity: number; minimum: number; rack: string }>;
}

export const PARTS = {
  // Genuine, healthy stock (main 40 - 8 issued = 32, minimum 12).
  sparkPlug: {
    partNumber: "18846-DM010", name: "Spark plug, iridium", category: "Ignition", partFlag: "O", partType: "S", uom: "PCS",
    unitPrice: 6_200, retailRate: 7_800, warrantyApplicable: true, warrantyRate: 6_800,
    stock: { main: { quantity: 40, minimum: 12, rack: "IGN-01" }, second: { quantity: 24, minimum: 8, rack: "IGN-01" } },
  },
  // Local consumable, low stock (main 6 - 2 issued = 4, below the minimum of 10).
  engineOil: {
    partNumber: "LOC-EO5W30-4L", name: "Engine oil 5W-30, 4 litres", category: "Lubricants", partFlag: "L", partType: "O", uom: "CAN",
    unitPrice: 21_000, retailRate: 27_500, warrantyApplicable: false,
    stock: { main: { quantity: 6, minimum: 10, rack: "LUB-02" }, second: { quantity: 9, minimum: 6, rack: "LUB-02" } },
  },
  // Diagnosis findings (phase 3) list these as parts needed; no job issues them yet.
  brakePads: {
    partNumber: "58101-DM100", name: "Front brake pads set", category: "Brakes", partFlag: "O", partType: "S", uom: "SET",
    unitPrice: 36_000, retailRate: 45_000, warrantyApplicable: true, warrantyRate: 40_000,
    stock: { main: { quantity: 12, minimum: 4, rack: "BRK-01" }, second: { quantity: 6, minimum: 2, rack: "BRK-01" } },
  },
  // Warranty check (phase 4): a claimable part for the AC finding.
  acCompressor: {
    partNumber: "97701-DM300", name: "AC compressor", category: "Air conditioning", partFlag: "O", partType: "S", uom: "PCS",
    unitPrice: 380_000, retailRate: 480_000, warrantyApplicable: true, warrantyRate: 420_000,
    stock: { main: { quantity: 3, minimum: 1, rack: "AC-01" }, second: { quantity: 1, minimum: 1, rack: "AC-01" } },
  },
  acRefrigerant: {
    partNumber: "LOC-R134A-500G", name: "AC refrigerant R134a, 500 g", category: "Air conditioning", partFlag: "L", partType: "S", uom: "CAN",
    unitPrice: 7_500, retailRate: 9_000, warrantyApplicable: false,
    stock: { main: { quantity: 20, minimum: 6, rack: "AC-02" }, second: { quantity: 10, minimum: 4, rack: "AC-02" } },
  },
  // Genuine; the seeded jobs use the last two at the main branch (zero stock there),
  // so only the second branch has it (other-branch-only stock).
  ignitionCoil: {
    partNumber: "27301-DM020", name: "Ignition coil assembly", category: "Ignition", partFlag: "O", partType: "S", uom: "PCS",
    unitPrice: 41_000, retailRate: 52_000, warrantyApplicable: true, warrantyRate: 46_000,
    stock: { main: { quantity: 2, minimum: 2, rack: "IGN-03" }, second: { quantity: 5, minimum: 2, rack: "IGN-03" } },
  },
  // Repair (phase 6): found during repair and priced on a supplementary estimate.
  wiperBlade: {
    partNumber: "98850-DM000", name: "Rear wiper blade", category: "Body", partFlag: "O", partType: "S", uom: "PCS",
    unitPrice: 6_500, retailRate: 8_500, warrantyApplicable: false,
    stock: { main: { quantity: 10, minimum: 3, rack: "BDY-01" }, second: { quantity: 4, minimum: 2, rack: "BDY-01" } },
  },
} satisfies Record<string, PartFixture>;

export type PartKey = keyof typeof PARTS;

export const LABOUR = {
  service: { code: "DM-PM-SVC", description: "Periodic maintenance service", vehicleSystem: "General", group: "Maintenance", defaultHours: 1.5, rate: 9_500 },
  diagnosis: { code: "DM-DIAG-ENG", description: "Engine diagnosis with scan tool", vehicleSystem: "Engine", group: "Diagnosis", defaultHours: 0.5, rate: 12_500 },
  ignition: { code: "DM-IGN-RPL", description: "Replace ignition coil and spark plugs", vehicleSystem: "Engine", group: "Repair", defaultHours: 0.8, rate: 12_500 },
  // The labour catalogue has no free-text lines, so free-text work is quoted on this general
  // operation and described in a complaint (free-text) line of the estimate.
  general: { code: "DM-GEN-LAB", description: "General labour (see estimate notes)", vehicleSystem: "General", group: "General", defaultHours: 1, rate: 10_000 },
  brakePads: { code: "DM-BRK-PAD", description: "Replace front brake pads", vehicleSystem: "Brakes", group: "Repair", defaultHours: 1, rate: 15_000 },
  acCheck: { code: "DM-AC-CHK", description: "AC system check and refrigerant recharge", vehicleSystem: "Air conditioning", group: "Repair", defaultHours: 1, rate: 18_000 },
  steering: { code: "DM-WHL-BAL", description: "Wheel balancing and alignment", vehicleSystem: "Steering", group: "Repair", defaultHours: 1, rate: 12_000 },
  wiper: { code: "DM-BDY-WPR", description: "Replace rear wiper blade", vehicleSystem: "Body", group: "Repair", defaultHours: 0.3, rate: 3_000 },
} as const;

export type LabourKey = keyof typeof LABOUR;

/** Hourly rate claimed from the manufacturer for warranty labour. */
export const WARRANTY_LABOUR_RATE = 11_000;

/** Claim codes used by the seeded cases (same codes as prisma/seed/warranty.ts). */
export const WARRANTY_CODES = {
  complaint: [["C104", "Engine misfire"], ["C210", "Warning light on"]],
  defect: [["D07", "Internal short"], ["D11", "Fouled"], ["D15", "Contaminated"]],
  position: [["P02", "Cylinder 2"], ["P03", "Cylinder 3"]],
  reject: [["R01", "Not a manufacturing defect"]],
} as const;

// ── Job cards ────────────────────────────────────────────────────────────────

export type ServiceTypeCode = "RG" | "RR" | "1F";

export interface EstimateFixture {
  description: string;
  parts: [PartKey, number][];
  labour: [LabourKey, number][];
  /** Free-text lines (type COMPLAINT, no charge). */
  notes?: string[];
  decision?: { approved: boolean; comments: string };
}

export interface ClaimLineFixture {
  /** Set to take the line from the job card (part issued or labour charged to warranty). */
  fromJobCard?: PartKey | LabourKey;
  part?: PartKey;
  role?: "CAUSAL" | "CONSEQUENTIAL";
  labour?: { operationCode: string; description: string; hours: number };
  defect?: string;
  position?: string;
  quantity?: number;
}

export interface ClaimFixture {
  complaintCode: string;
  lines: ClaimLineFixture[];
  /** Where the claim ends up. OPEN leaves it as a draft. */
  outcome: "OPEN" | "SUBMITTED" | "REJECTED";
  manufacturerClaimNo?: string;
  rejectReason?: string;
  remarks?: string;
}

import type { CheckInLevel } from "./check-in";

export type StageStop = "DIAGNOSIS" | "WARRANTY" | "ESTIMATE" | "CANCELLED" | "WAITING_PARTS" | "QUALITY_CHECK" | "QC_PASSED";

/** One finding: for the customer request at `request` (0-based), or one the customer did not mention (null). */
export interface FindingFixture {
  request: number | null;
  text: string;
  possibleWarranty?: boolean;
  labour?: LabourKey[];
  parts?: [PartKey, number][];
  /** At the warranty check: these items are charged to warranty (the rest are customer pay). */
  warranty?: (LabourKey | PartKey)[];
}

/**
 * Diagnosis for a job that stops at it (phase 3): how far it gets and what the technician found.
 * findings: recorded, not sent; review: sent to the service engineer; returned: sent back with a note;
 * confirmed: confirmed by the engineer.
 */
/**
 * Repair (phase 6). Work lines are named by labour key, or "serviceType" for the service type's own line.
 * A finding is raised by the technician; the advisor then prepares (and may present) a supplementary estimate.
 */
export interface RepairFixture {
  done?: (LabourKey | "serviceType")[];
  started?: (LabourKey | "serviceType")[];
  waiting?: (LabourKey | "serviceType")[];
  finding?: { text: string; parts: [PartKey, number][]; labour?: LabourKey[] };
  supplementary?: "prepared" | "presented";
}

/** Quality check (phase 7): the supervisor fails the check first, returning these lines to the technician. */
export interface QualityCheckFixture {
  fail: { note: string; lines: (LabourKey | "serviceType")[] };
  /** The technician redoes the failed work and sends the job for a second check. */
  redone: boolean;
}

export interface DiagnosisFixture {
  /** confirmed: the engineer confirms these findings and routing moves the job on (to the warranty check). */
  stop: "findings" | "review" | "returned" | "confirmed";
  findings: FindingFixture[];
  returnNote?: string;
}

export interface JobFixture {
  id: string;
  vehicle: VehicleKey;
  branch: BranchKey;
  serviceType: ServiceTypeCode;
  description: string;
  complaints: string[];
  mileage: number;
  /** Main mechanic. Without one the job is assigned to a team only ("unassigned"). */
  withTechnician: boolean;
  repeatOf?: string;
  repeatReason?: string;
  estimates: EstimateFixture[];
  labour: [LabourKey, number][];
  /** Issued in this order. */
  issues: [PartKey, number][];
  /** Job card lines reclassified as warranty (who pays). */
  warrantyLabour?: LabourKey[];
  workDone?: string;
  target: "OPEN" | "IN_PROGRESS" | "READY" | "BILLED" | "BILLED_PAID" | "BILLED_CREDIT";
  /**
   * Where the job stops on the staged job card. OPEN jobs stop at check-in unless told otherwise;
   * IN_PROGRESS jobs stop in repair unless told to pause for parts or go on to quality check.
   */
  stop?: StageStop;
  /** For a job that stays at check-in: how far check-in has got (default: just opened). */
  checkIn?: CheckInLevel;
  /** For a job that stops at diagnosis with a technician: findings and how far they got. */
  diagnosis?: DiagnosisFixture;
  /**
   * The staged estimate (phase 5): prepared as a draft, prepared and presented to the customer, or
   * approved by the customer on the phone (then released when the target is IN_PROGRESS).
   */
  estimateStep?: "prepared" | "presented" | "approved";
  /** Repair (phase 6): how far the technician got with the work list, and a finding raised during repair. */
  repair?: RepairFixture;
  /** Quality check (phase 7): a failed check before the job stops. */
  qualityCheck?: QualityCheckFixture;
  /** Billing (phase 8): a second notice by SMS and the washed tick, after the vehicle is marked ready. */
  billing?: { notifyAgain?: boolean; washed?: boolean };
  /** An earlier odometer reading for a vehicle with no visits yet, so check-in shows "Last recorded". */
  priorMileage?: number;
  /** The answer recorded for linked campaigns (FPC) before READY; without it a FREE line must pre-set it. */
  campaignWork?: { attended: true } | { attended: false; reason: NotAttendedReason; note?: string };
  claim?: ClaimFixture;
  /** The job is dated `startDaysAgo` days before the run and its events spread over `spanHours`. */
  startDaysAgo: number;
  spanHours: number;
}

/**
 * Seeded in this order. Vehicles visit one at a time: a vehicle's earlier job is delivered
 * before its next job is opened.
 */
export const JOBS: JobFixture[] = [
  {
    id: "JC-01",
    vehicle: "sorento", branch: "main", serviceType: "RG",
    description: "40,000 km paid service. Customer reports a slightly rough idle.",
    complaints: ["40,000 km periodic service", "Slightly rough idle when cold"],
    mileage: 40_120, withTechnician: true,
    estimates: [{
      description: "40,000 km service with spark plugs",
      parts: [["sparkPlug", 4], ["engineOil", 1]], labour: [["service", 2]],
      decision: { approved: true, comments: "Approved by the customer at the service desk" },
    }],
    labour: [["service", 2]], issues: [["sparkPlug", 4], ["engineOil", 1]],
    workDone: "Service done, spark plugs replaced. ECU software updated under free fix campaign.",
    campaignWork: { attended: true },
    target: "BILLED_PAID", startDaysAgo: 21, spanHours: 30,
  },
  {
    id: "JC-02",
    vehicle: "sportage", branch: "main", serviceType: "RG",
    description: "15,000 km service. Engine misfires under load, check-engine light on.",
    complaints: ["15,000 km periodic service", "Engine misfire under load, check-engine light on"],
    mileage: 15_240, withTechnician: true,
    estimates: [{
      description: "Service, ignition coil and spark plugs (coil and plugs claimed under warranty)",
      parts: [["ignitionCoil", 1], ["sparkPlug", 4], ["engineOil", 1]], labour: [["service", 1.5], ["ignition", 0.8]],
      decision: { approved: true, comments: "Fleet desk approved by phone" },
    }],
    labour: [["service", 1.5], ["ignition", 0.8]],
    issues: [["ignitionCoil", 1], ["sparkPlug", 4], ["engineOil", 1]],
    warrantyLabour: ["ignition"],
    workDone: "Service done. Cylinder 2 coil failed (internal short); coil and plugs replaced under warranty.",
    target: "BILLED_CREDIT",
    claim: {
      complaintCode: "C104",
      lines: [
        { fromJobCard: "ignitionCoil", defect: "D07", position: "P02" },
        { fromJobCard: "sparkPlug", defect: "D11", position: "P02" },
        { fromJobCard: "ignition", position: "P02" },
      ],
      outcome: "SUBMITTED", manufacturerClaimNo: "DMCLM-26-0101",
      remarks: "Submitted to the manufacturer warranty portal",
    },
    startDaysAgo: 12, spanHours: 52,
  },
  {
    id: "JC-03",
    vehicle: "rio", branch: "second", serviceType: "RR",
    description: "Engine misfire and check-engine light. Oil change due.",
    complaints: ["Engine misfire at idle", "Oil change due"],
    mileage: 6_480, withTechnician: true,
    estimates: [{
      description: "Ignition repair under warranty and oil change",
      parts: [["ignitionCoil", 1], ["sparkPlug", 4], ["engineOil", 1]], labour: [["diagnosis", 0.5], ["ignition", 0.8]],
      decision: { approved: true, comments: "Customer approved; coil and plugs to be claimed under warranty" },
    }],
    labour: [["diagnosis", 0.5], ["ignition", 0.8]],
    issues: [["ignitionCoil", 1], ["sparkPlug", 4], ["engineOil", 1]],
    warrantyLabour: ["ignition"],
    target: "IN_PROGRESS",
    claim: {
      complaintCode: "C104",
      lines: [
        { fromJobCard: "ignitionCoil", defect: "D07", position: "P03" },
        { fromJobCard: "sparkPlug", defect: "D11", position: "P03" },
        { fromJobCard: "ignition", position: "P03" },
      ],
      outcome: "OPEN",
    },
    startDaysAgo: 3, spanHours: 20,
  },
  {
    id: "JC-04",
    vehicle: "sorento", branch: "main", serviceType: "RR",
    description: "Check-engine light on and hesitation when accelerating, two weeks after the last service.",
    complaints: ["Check-engine light on", "Hesitation when accelerating"],
    mileage: 41_050, withTechnician: true,
    repeatOf: "JC-01", repeatReason: "Customer returned with an engine complaint after the 40,000 km service",
    estimates: [{
      description: "Diagnose and replace the ignition coil",
      parts: [["ignitionCoil", 1]], labour: [["diagnosis", 0.5], ["ignition", 0.8]],
      decision: { approved: true, comments: "Approved by the customer" },
    }],
    labour: [["diagnosis", 0.5], ["ignition", 0.8]], issues: [["ignitionCoil", 1]],
    workDone: "Cylinder 4 coil replaced. Road tested, no fault codes.",
    target: "READY", startDaysAgo: 6, spanHours: 28,
  },
  {
    id: "JC-05",
    vehicle: "sportage", branch: "main", serviceType: "RR",
    description: "Misfire has returned. Warranty claim rejected; awaiting the customer's decision on the revised estimate.",
    complaints: ["Engine misfire has returned", "Engine warning light on"],
    mileage: 16_010, withTechnician: false,
    repeatOf: "JC-02", repeatReason: "Misfire returned after the warranty repair",
    estimates: [
      {
        description: "Replace ignition coil and spark plugs at the customer's cost",
        parts: [["ignitionCoil", 1], ["sparkPlug", 4]], labour: [["diagnosis", 0.5], ["ignition", 0.8]],
        decision: { approved: false, comments: "Sent back: the customer asked for a cheaper option after the warranty claim was rejected" },
      },
      {
        description: "Revised: spark plugs, oil change and fuel system flush",
        parts: [["sparkPlug", 4], ["engineOil", 1]], labour: [["ignition", 0.8], ["general", 1.5]],
        notes: ["Fuel system flush and injector cleaning (free-text labour, quoted under general labour)"],
      },
    ],
    labour: [], issues: [],
    target: "OPEN",
    claim: {
      complaintCode: "C104",
      lines: [
        { part: "ignitionCoil", role: "CAUSAL", defect: "D15", position: "P02", quantity: 1 },
        { part: "sparkPlug", role: "CONSEQUENTIAL", defect: "D15", position: "P02", quantity: 4 },
        { labour: { operationCode: LABOUR.ignition.code, description: LABOUR.ignition.description, hours: 0.8 }, position: "P02" },
      ],
      outcome: "REJECTED", manufacturerClaimNo: "DMCLM-26-0102", rejectReason: "R01",
      remarks: "Manufacturer found fuel contamination in the injectors: not a manufacturing defect",
    },
    startDaysAgo: 4, spanHours: 30,
  },
  {
    id: "TEST-01",
    vehicle: "test1", branch: "main", serviceType: "RR",
    description: "TEST warranty case: engine warning light. For warranty testing only.",
    complaints: ["TEST: engine warning light on"],
    mileage: 4_200, withTechnician: false, estimates: [], labour: [], issues: [],
    target: "OPEN", startDaysAgo: 0, spanHours: 0,
  },
  {
    id: "TEST-02",
    vehicle: "test2", branch: "second", serviceType: "RR",
    description: "TEST warranty case: rough idle. For warranty testing only.",
    complaints: ["TEST: rough idle"],
    mileage: 3_100, withTechnician: false, estimates: [], labour: [], issues: [],
    target: "OPEN", startDaysAgo: 0, spanHours: 0,
  },
];

// ── Campaigns ────────────────────────────────────────────────────────────────

export interface CampaignVinFixture {
  /** A seeded vehicle, or a VIN with no vehicle record. */
  vehicle?: VehicleKey;
  vin?: string;
  /** Status to reach. COMPLETED comes from the job card that did the work. */
  status: "PENDING" | "CONTACTED" | "SCHEDULED" | "COMPLETED";
}

export interface CampaignFixture {
  code: string;
  title: string;
  type: "RECALL" | "FREE_FIX" | "SERVICE_CAMPAIGN";
  status: "DRAFT" | "ACTIVE";
  description: string;
  defectDescription?: string;
  startDaysAgo: number;
  durationDays: number;
  model: WorkshopModelKey;
  /** Model years covered, relative to the sale year of the covered seeded vehicle (or the run year). */
  years: [number, number];
  coveredItems: { kind: "PART" | "LABOUR"; partNumber?: string; operationCode?: string; description: string; maxQuantity: number }[];
  vins: CampaignVinFixture[];
}

/**
 * Created before the job cards: the free fix must be active when JC-01 is opened so its
 * completion links to that job card. The recall starts after the Sportage's last visit, so
 * the Sportage is still pending in it (the campaign shows on its next job card).
 */
export const CAMPAIGNS = {
  freeFix: {
    code: "FF-DM-2602", title: "ECU software update for cold-start idle", type: "FREE_FIX", status: "ACTIVE",
    description: "Update the engine control unit software to improve idle quality after a cold start.",
    defectDescription: "Some engines may idle roughly for the first minutes after a cold start.",
    startDaysAgo: 45, durationDays: 180, model: "SORENTO", years: [-1, 1],
    coveredItems: [
      { kind: "LABOUR", operationCode: "FF2602-01", description: "ECU software update", maxQuantity: 0.5 },
      { kind: "PART", partNumber: "39110-DMxxx", description: "Engine control unit (only if the update fails)", maxQuantity: 1 },
    ],
    vins: [
      { vehicle: "sorento", status: "COMPLETED" },
      { vin: "KNAPM81DMK7000311", status: "SCHEDULED" },
      { vin: "KNAPM81DMK7000312", status: "PENDING" },
    ],
  },
  recall: {
    code: "RC-DM-2601", title: "Engine wiring harness inspection", type: "RECALL", status: "ACTIVE",
    description: "Inspect the engine wiring harness and correct its routing, or replace it if damaged.",
    defectDescription: "The engine wiring harness may chafe against the intake manifold bracket.",
    startDaysAgo: 2, durationDays: 180, model: "SPORTAGE", years: [-2, 1],
    coveredItems: [
      { kind: "LABOUR", operationCode: "RC2601-01", description: "Inspect and reroute engine wiring harness", maxQuantity: 1.2 },
      { kind: "PART", partNumber: "91200-DMxxx", description: "Engine wiring harness", maxQuantity: 1 },
    ],
    vins: [
      { vehicle: "sportage", status: "PENDING" },
      { vin: "KNAPX81DMR7000111", status: "CONTACTED" },
      // No vehicle record yet: it links automatically when the vehicle is registered.
      { vin: "KNAPX81DMR7000112", status: "PENDING" },
    ],
  },
  serviceCampaign: {
    code: "SC-DM-2603", title: "Complimentary air-conditioning check", type: "SERVICE_CAMPAIGN", status: "DRAFT",
    description: "Ten-point air-conditioning performance check with a cabin filter replacement.",
    startDaysAgo: -7, durationDays: 90, model: "RIO", years: [-2, 0],
    coveredItems: [
      { kind: "LABOUR", operationCode: "SC2603-01", description: "Air-conditioning performance check", maxQuantity: 0.5 },
      { kind: "PART", partNumber: "97133-DMxxx", description: "Cabin air filter", maxQuantity: 1 },
    ],
    vins: [
      { vin: "KNADN51DMS7000211", status: "PENDING" },
      { vin: "KNADN51DMS7000212", status: "PENDING" },
      { vin: "KNADN51DMS7000213", status: "PENDING" },
    ],
  },
} satisfies Record<string, CampaignFixture>;

// ── FPC bulletin (#98) ───────────────────────────────────────────────────────

/**
 * One FPC bulletin over the fpc* Sorentos, so every list of the FPC vehicles report has rows:
 * 401 to be called; 402 called by letter, not visited; 403 visited, work not done (parts);
 * 404 phoned, then attended; 405 attended without a call; 406 at work, answer not given yet.
 * 407 is inside the range but not registered: registering it adds it to the bulletin.
 */
export const FPC_BULLETIN = {
  code: "DEMO-KC26-P010-XM",
  title: "Sorento (XM) fuel pump plate cover replacement (demo)",
  description: "Countermeasure for all customers visiting the workshop: inspect the fuel pump plate cover and replace it if it is the early type.",
  defectDescription: "The early fuel pump plate cover can crack and seep fuel odour into the cabin.",
  jobCardText: "130005-SORENTO (XM) - check fuel pump plate cover",
  bulletinDaysAgo: 40,
  startDaysAgo: 35,
  range: { vinFrom: "KNAKU81DMC5000401", vinTo: "KNAKU81DMC5000410" },
  notRegisteredVin: "KNAKU81DMC5000407",
  letterTo: "fpcLetter",
  phoned: "fpcDone",
  contactDaysAgo: 12,
} as const satisfies { letterTo: VehicleKey; phoned: VehicleKey } & Record<string, unknown>;

const fpcJob = (id: string, vehicle: VehicleKey, branch: BranchKey, work: JobFixture["campaignWork"], target: JobFixture["target"], startDaysAgo: number): JobFixture => ({
  id,
  vehicle,
  branch,
  serviceType: "RG",
  description: "Periodic service; check the open FPC bulletin.",
  complaints: ["Periodic service"],
  mileage: 96_000 + startDaysAgo * 10,
  withTechnician: true,
  estimates: [{ description: "Periodic service", parts: [], labour: [["service", 1.5]], decision: { approved: true, comments: "Approved at the service desk" } }],
  labour: [["service", 1.5]],
  issues: [],
  workDone: "Periodic service done",
  campaignWork: work,
  target,
  startDaysAgo,
  spanHours: 6,
});

/** Seeded after the bulletin is active, so each job card is linked to it at opening. */
export const FPC_JOBS: JobFixture[] = [
  fpcJob("JC-FPC-1", "fpcSkipped", "main", { attended: false, reason: "PARTS_NOT_AVAILABLE", note: "Plate cover on back order" }, "BILLED_PAID", 6),
  fpcJob("JC-FPC-2", "fpcDone", "main", { attended: true }, "BILLED_PAID", 5),
  fpcJob("JC-FPC-3", "fpcWalkIn", "second", { attended: true }, "BILLED_PAID", 4),
  // Left at work: QC, then try "Mark vehicle ready" to see the attendance rule.
  fpcJob("JC-FPC-4", "fpcAtQc", "main", undefined, "IN_PROGRESS", 1),
];

const serviceEstimate = (decided: boolean): EstimateFixture => ({
  description: "Periodic service",
  parts: [],
  labour: [["service", 1.5]],
  ...(decided ? { decision: { approved: true, comments: "Approved by the customer at the service desk" } } : {}),
});

const stageJob = (
  id: string,
  vehicle: VehicleKey,
  fields: Pick<JobFixture, "description" | "complaints" | "mileage" | "withTechnician" | "target" | "checkIn" | "priorMileage" | "diagnosis" | "estimateStep" | "repair" | "qualityCheck" | "billing"> & {
    /** Repair jobs priced from their diagnosis record labour through the work list, not as legacy lines. */
    labour?: [LabourKey, number][];
    issues?: [PartKey, number][];
    stop?: StageStop;
    estimate?: "none" | "pending" | "approved";
    serviceType?: ServiceTypeCode;
  },
): JobFixture => ({
  id,
  vehicle,
  branch: "main",
  serviceType: fields.serviceType ?? "RG",
  description: fields.description,
  complaints: fields.complaints,
  mileage: fields.mileage,
  withTechnician: fields.withTechnician,
  estimates: fields.estimate === "none" ? [] : [serviceEstimate(fields.estimate !== "pending")],
  labour: fields.labour ?? (fields.target === "OPEN" ? [] : [["service", 1.5]]),
  issues: fields.issues ?? [],
  workDone: "Periodic service done. Brakes and air conditioning checked.",
  target: fields.target,
  stop: fields.stop,
  checkIn: fields.checkIn,
  diagnosis: fields.diagnosis,
  estimateStep: fields.estimateStep,
  repair: fields.repair,
  qualityCheck: fields.qualityCheck,
  billing: fields.billing,
  priorMileage: fields.priorMileage,
  startDaysAgo: 0,
  spanHours: 0,
});

/** Billing demo jobs (phase 8): the service and the brake pads, confirmed by the service engineer. */
const BILLING_DIAGNOSIS: DiagnosisFixture = {
  stop: "confirmed",
  findings: [
    { request: 0, text: "Due for the 50,000 km service.", labour: [], parts: [["engineOil", 1]] },
    { request: 1, text: "Front pads worn to 2 mm. Caliper slider dry.", labour: ["brakePads"], parts: [["brakePads", 1]] },
  ],
};

/** One job at every step of the staged job card (job card revamp, phase 0). Seeded after JOBS. */
export const STAGE_JOBS: JobFixture[] = [
  stageJob("JC-S01", "stgCheckIn", {
    description: "50,000 km periodic service. Noise from the front left wheel when braking.",
    complaints: ["Noise from front left wheel when braking", "AC not cooling well", "Periodic service (50,000 km)"],
    mileage: 48_250, withTechnician: false, target: "OPEN", estimate: "none", priorMileage: 43_100,
  }),
  stageJob("JC-S02", "stgAssign", {
    description: "Engine warning light came on yesterday.",
    complaints: ["Engine warning light on"],
    mileage: 88_400, withTechnician: false, target: "OPEN", stop: "DIAGNOSIS", estimate: "none",
  }),
  stageJob("JC-S03", "stgFindings", {
    description: "Vibration through the steering wheel at highway speed.",
    complaints: ["Steering wheel vibrates above 100 km/h"],
    mileage: 91_020, withTechnician: true, target: "OPEN", stop: "DIAGNOSIS", estimate: "none",
  }),
  stageJob("JC-S04", "stgWarranty", {
    description: "AC blows warm air after ten minutes of driving.",
    complaints: ["AC not cooling well"],
    mileage: 27_300, withTechnician: true, target: "OPEN", stop: "WARRANTY", estimate: "none",
  }),
  stageJob("JC-S05", "stgEstimate", {
    description: "Periodic service and a squeaking door hinge.",
    complaints: ["Periodic service", "Driver door hinge squeaks"],
    mileage: 95_600, withTechnician: true, target: "OPEN", stop: "ESTIMATE", estimate: "pending",
  }),
  stageJob("JC-S06", "stgParts", {
    description: "Periodic service. Waiting for an oil filter from the main store.",
    complaints: ["Periodic service"],
    mileage: 97_150, withTechnician: true, target: "IN_PROGRESS", stop: "WAITING_PARTS",
  }),
  stageJob("JC-S07", "stgQc", {
    description: "Periodic service, work finished and waiting for the quality check.",
    complaints: ["Periodic service"],
    mileage: 99_300, withTechnician: true, target: "IN_PROGRESS", stop: "QUALITY_CHECK",
  }),
  stageJob("JC-S08", "stgBilling", {
    description: "Periodic service, quality check passed, waiting for the advisor to mark it ready.",
    complaints: ["Periodic service"],
    mileage: 92_800, withTechnician: true, target: "IN_PROGRESS", stop: "QC_PASSED",
  }),
  stageJob("JC-S09", "stgDelivery", {
    description: "Periodic service, billed and waiting for the customer to collect.",
    complaints: ["Periodic service"],
    mileage: 90_450, withTechnician: true, target: "BILLED",
  }),
  stageJob("JC-S10", "stgCancelled", {
    description: "Periodic service. Customer took the vehicle elsewhere.",
    complaints: ["Periodic service"],
    mileage: 94_700, withTechnician: true, target: "OPEN", stop: "CANCELLED", estimate: "pending",
  }),
  stageJob("JC-S11", "stgConsent", {
    description: "Periodic service. Wipers smear the windscreen.",
    complaints: ["Periodic service (30,000 km)", "Wipers smear the windscreen"],
    mileage: 29_800, withTechnician: false, target: "OPEN", estimate: "none", checkIn: "walkAround", priorMileage: 24_600,
  }),
  // Diagnosis (phase 3): with the service engineer, one finding flagged possible warranty (routes to warranty).
  stageJob("JC-S13", "stgReview", {
    description: "Noise from the front left wheel when braking, and the AC is not cooling well.",
    complaints: ["Noise from front left wheel when braking", "AC not cooling well"],
    mileage: 93_400, withTechnician: true, target: "OPEN", stop: "DIAGNOSIS", estimate: "none",
    diagnosis: {
      stop: "review",
      findings: [
        { request: 0, text: "Front pads worn to 2 mm, disc surface fine.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 1, text: "Compressor clutch not engaging. No refrigerant leak seen.", possibleWarranty: true, labour: ["acCheck"], parts: [["acRefrigerant", 1]] },
        { request: null, text: "Rear wiper blade torn.", labour: [], parts: [] },
      ],
    },
  }),
  // Returned by the service engineer with a note; the technician sees it in a banner.
  stageJob("JC-S14", "stgReturned", {
    description: "Steering pulls to the left on the expressway.",
    complaints: ["Steering pulls to the left"],
    mileage: 88_900, withTechnician: true, target: "OPEN", stop: "DIAGNOSIS", estimate: "none",
    diagnosis: {
      stop: "returned",
      findings: [{ request: 0, text: "Front tyres worn unevenly.", labour: ["steering"], parts: [] }],
      returnNote: "Check the wheel alignment readings and the front suspension bushes before we quote.",
    },
  }),
  // With the service engineer, nothing warranty related: confirming sends it straight to the advisor.
  stageJob("JC-S15", "stgPlain", {
    description: "Periodic service (100,000 km).",
    complaints: ["Periodic service (100,000 km)"],
    mileage: 99_800, withTechnician: true, target: "OPEN", stop: "DIAGNOSIS", estimate: "none",
    diagnosis: {
      stop: "review",
      findings: [{ request: 0, text: "Due for the 100,000 km service. No other faults found.", labour: ["service"], parts: [["engineOil", 1]] }],
    },
  }),
  // Warranty check (phase 4), with the warranty officer. One missed service in year 2; AC items to claim.
  stageJob("JC-S16", "stgWtyIrregular", {
    description: "AC not cooling well, brakes noisy, and the 25,000 km service.",
    complaints: ["AC not cooling well", "Noise from front left wheel when braking", "Periodic service (25,000 km)"],
    mileage: 27_300, withTechnician: true, target: "OPEN", stop: "WARRANTY", estimate: "none",
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Compressor clutch not engaging. No refrigerant leak seen.", possibleWarranty: true, labour: ["acCheck"], parts: [["acCompressor", 1], ["acRefrigerant", 1]] },
        { request: 1, text: "Front pads worn to 2 mm, disc surface fine.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 2, text: "Due for the 25,000 km service.", labour: ["service"], parts: [["engineOil", 1]] },
      ],
    },
  }),
  // Regular history and the open recall: the recall work can be charged to the campaign.
  stageJob("JC-S17", "stgWtyRegular", {
    description: "Periodic service and the engine wiring harness recall.",
    complaints: ["Periodic service (15,000 km)", "Engine wiring harness recall"],
    mileage: 12_400, withTechnician: true, target: "OPEN", stop: "WARRANTY", estimate: "none",
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Due for the 15,000 km service.", labour: ["service"], parts: [["engineOil", 1]] },
        { request: 1, text: "Harness rubbing on the intake bracket. Reroute as per the recall.", labour: ["general"] },
      ],
    },
  }),
  // No sale date: the service history cannot be checked; the AC finding is flagged possible warranty.
  stageJob("JC-S18", "stgWtyNoSale", {
    description: "AC not cooling well.",
    complaints: ["AC not cooling well"],
    mileage: 18_600, withTechnician: true, target: "OPEN", stop: "WARRANTY", estimate: "none",
    diagnosis: {
      stop: "confirmed",
      findings: [{ request: 0, text: "Compressor clutch not engaging.", possibleWarranty: true, labour: ["acCheck"], parts: [["acCompressor", 1]] }],
    },
  }),
  // Estimate (phase 5): findings priced from the catalogue, the AC compressor and its labour on warranty.
  stageJob("JC-S19", "stgEstPrepare", {
    description: "Noise from the front left wheel when braking, AC not cooling well, and the periodic service.",
    complaints: ["Noise from front left wheel when braking", "AC not cooling well", "Periodic service (5,000 km)"],
    mileage: 5_200, withTechnician: true, target: "OPEN", stop: "ESTIMATE", estimate: "none",
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Front pads worn to 2 mm, disc surface fine.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 1, text: "Compressor clutch not engaging. Refrigerant low after the repair test.", possibleWarranty: true, labour: ["acCheck"], parts: [["acCompressor", 1], ["acRefrigerant", 1]], warranty: ["acCheck", "acCompressor"] },
        { request: 2, text: "Due for the 5,000 km service.", labour: ["service"], parts: [["engineOil", 1]] },
      ],
    },
  }),
  // Prepared, for a phone approval: the customer left and approves on the phone.
  stageJob("JC-S20", "stgEstPhone", {
    description: "Brakes noisy and the periodic service.",
    complaints: ["Brakes noisy", "Periodic service"],
    mileage: 101_300, withTechnician: true, target: "OPEN", stop: "ESTIMATE", estimate: "none", estimateStep: "prepared",
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Front pads worn to 3 mm.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 1, text: "Due for the periodic service.", labour: ["service"], parts: [["engineOil", 1]] },
      ],
    },
  }),
  // Presented to the customer, who is expected to decline everything (estimation charge, terms clause 4).
  stageJob("JC-S21", "stgEstDecline", {
    description: "Brakes noisy.",
    complaints: ["Brakes noisy"],
    mileage: 104_800, withTechnician: true, target: "OPEN", stop: "ESTIMATE", estimate: "none", estimateStep: "presented",
    diagnosis: {
      stop: "confirmed",
      findings: [{ request: 0, text: "Front pads worn to 2 mm, rear pads fine.", labour: ["brakePads"], parts: [["brakePads", 1]] }],
    },
  }),
  // A free first service with a warranty repair: the customer pays nothing, so no advance is needed.
  stageJob("JC-S22", "stgEstFree", {
    description: "First free service. AC not cooling well.",
    complaints: ["First free service", "AC not cooling well"],
    mileage: 1_100, withTechnician: true, target: "OPEN", stop: "ESTIMATE", estimate: "none", estimateStep: "prepared", serviceType: "1F",
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "First service due. The free service covers the work.", labour: [], parts: [] },
        { request: 1, text: "Compressor clutch not engaging.", possibleWarranty: true, labour: ["acCheck"], parts: [["acCompressor", 1]], warranty: ["acCheck", "acCompressor"] },
      ],
    },
  }),
  // Repair (phase 6): released from an approved estimate. The service is done, the brakes are in progress,
  // the AC repair (warranty) waits for the compressor; pads and oil are issued and ready to collect.
  stageJob("JC-S23", "stgRepairWork", {
    description: "Periodic service, noise from the front left wheel when braking, and the AC not cooling well.",
    complaints: ["Periodic service (5,000 km)", "Noise from front left wheel when braking", "AC not cooling well"],
    mileage: 5_400, withTechnician: true, target: "IN_PROGRESS", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Due for the 5,000 km service.", labour: [], parts: [["engineOil", 1]] },
        { request: 1, text: "Front pads worn to 2 mm, disc surface fine.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 2, text: "Compressor clutch not engaging.", possibleWarranty: true, labour: ["acCheck"], parts: [["acCompressor", 1]], warranty: ["acCheck", "acCompressor"] },
      ],
    },
    repair: { done: ["serviceType"], started: ["brakePads"], waiting: ["acCheck"] },
  }),
  // The technician found a torn rear wiper blade: the advisor sees the banner and prepares the supplementary estimate.
  stageJob("JC-S24", "stgRepairFinding", {
    description: "Brakes noisy and the periodic service.",
    complaints: ["Brakes noisy", "Periodic service"],
    mileage: 102_600, withTechnician: true, target: "IN_PROGRESS", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1]],
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Front pads worn to 3 mm.", labour: ["brakePads"], parts: [["brakePads", 1]] },
        { request: 1, text: "Due for the periodic service.", labour: [], parts: [] },
      ],
    },
    repair: { done: ["serviceType", "brakePads"], finding: { text: "Rear wiper blade torn. It smears the rear screen.", parts: [["wiperBlade", 1]], labour: ["wiper"] } },
  }),
  // The supplementary estimate for the new finding is with the customer; approved work carries on.
  stageJob("JC-S25", "stgRepairSupp", {
    description: "Brakes noisy.",
    complaints: ["Brakes noisy"],
    mileage: 108_200, withTechnician: true, target: "IN_PROGRESS", estimate: "none", estimateStep: "approved", labour: [],
    diagnosis: {
      stop: "confirmed",
      findings: [{ request: 0, text: "Front pads worn to 2 mm.", labour: ["brakePads"], parts: [["brakePads", 1]] }],
    },
    repair: { started: ["brakePads"], finding: { text: "Rear wiper blade torn.", parts: [["wiperBlade", 1]], labour: ["wiper"] }, supplementary: "presented" },
  }),
  // Quality check (phase 7): every work line done and sent for the check; the supervisor checks it.
  stageJob("JC-S26", "stgQcReady", {
    description: "50,000 km periodic service. Noise from the front left wheel when braking.",
    complaints: ["Periodic service (50,000 km)", "Noise from front left wheel when braking"],
    mileage: 48_262, withTechnician: true, target: "IN_PROGRESS", stop: "QUALITY_CHECK", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Due for the 50,000 km service.", labour: [], parts: [["engineOil", 1]] },
        { request: 1, text: "Front pads worn to 2 mm. Caliper slider dry.", labour: ["brakePads"], parts: [["brakePads", 1]] },
      ],
    },
  }),
  // The supervisor failed the check on the brake pads: the job is back with the technician.
  stageJob("JC-S27", "stgQcReturned", {
    description: "Periodic service. Brakes noisy at low speed.",
    complaints: ["Periodic service (50,000 km)", "Brakes noisy at low speed"],
    mileage: 51_840, withTechnician: true, target: "IN_PROGRESS", stop: "QUALITY_CHECK", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Due for the 50,000 km service.", labour: [], parts: [["engineOil", 1]] },
        { request: 1, text: "Front pads worn to 2 mm. Caliper slider dry.", labour: ["brakePads"], parts: [["brakePads", 1]] },
      ],
    },
    qualityCheck: { fail: { note: "Brake still noisy at low speed. Recheck front left caliper slider.", lines: ["brakePads"] }, redone: false },
  }),
  // Failed once, repaired, and back for a second check: the history shows the failed check.
  stageJob("JC-S28", "stgQcSecond", {
    description: "Periodic service. Squeal from the front brakes.",
    complaints: ["Periodic service (50,000 km)", "Squeal from the front brakes"],
    mileage: 49_115, withTechnician: true, target: "IN_PROGRESS", stop: "QUALITY_CHECK", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: {
      stop: "confirmed",
      findings: [
        { request: 0, text: "Due for the 50,000 km service.", labour: [], parts: [["engineOil", 1]] },
        { request: 1, text: "Front pads worn to 2 mm. Caliper slider dry.", labour: ["brakePads"], parts: [["brakePads", 1]] },
      ],
    },
    qualityCheck: { fail: { note: "Pads squeal under light braking. Clean and grease the caliper sliders.", lines: ["brakePads"] }, redone: true },
  }),
  // Billing (phase 8). The quality check passed; the advisor has not marked the vehicle ready yet.
  stageJob("JC-S29", "stgBillReady", {
    description: "50,000 km periodic service. Noise from the front left wheel when braking.",
    complaints: ["Periodic service (50,000 km)", "Noise from front left wheel when braking"],
    mileage: 50_410, withTechnician: true, target: "IN_PROGRESS", stop: "QC_PASSED", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: BILLING_DIAGNOSIS,
  }),
  // Marked ready and the customer told four days ago (then reminded by SMS), washed: two days of storage
  // are proposed when the invoice is created.
  {
    ...stageJob("JC-S30", "stgBillStorage", {
      description: "Periodic service. Brakes noisy when stopping.",
      complaints: ["Periodic service (50,000 km)", "Brakes noisy when stopping"],
      mileage: 52_960, withTechnician: true, target: "READY", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
      diagnosis: BILLING_DIAGNOSIS,
      billing: { notifyAgain: true, washed: true },
    }),
    startDaysAgo: 5,
    spanHours: 22,
  },
  // Invoiced; the advance is applied and a balance is left for the cashier.
  stageJob("JC-S31", "stgBillUnpaid", {
    description: "Periodic service. Squeal from the front brakes.",
    complaints: ["Periodic service (50,000 km)", "Squeal from the front brakes"],
    mileage: 47_380, withTechnician: true, target: "BILLED", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: BILLING_DIAGNOSIS,
  }),
  // Invoiced and unpaid: a fleet customer the service manager can approve for delivery on credit.
  stageJob("JC-S32", "stgBillCredit", {
    description: "Periodic service for a fleet vehicle. Brake noise reported by the driver.",
    complaints: ["Periodic service (50,000 km)", "Brake noise reported by the driver"],
    mileage: 55_120, withTechnician: true, target: "BILLED", estimate: "none", estimateStep: "approved", labour: [], issues: [["brakePads", 1], ["engineOil", 1]],
    diagnosis: BILLING_DIAGNOSIS,
  }),
  stageJob("JC-S12", "stgSigned", {
    description: "Clicking noise when turning the steering fully.",
    complaints: ["Clicking noise when turning the steering fully"],
    mileage: 96_900, withTechnician: false, target: "OPEN", estimate: "none", checkIn: "signed", priorMileage: 91_300,
  }),
];
