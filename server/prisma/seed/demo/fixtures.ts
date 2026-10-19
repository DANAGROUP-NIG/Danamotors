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
  // Genuine; the seeded jobs use the last two at the main branch (zero stock there),
  // so only the second branch has it (other-branch-only stock).
  ignitionCoil: {
    partNumber: "27301-DM020", name: "Ignition coil assembly", category: "Ignition", partFlag: "O", partType: "S", uom: "PCS",
    unitPrice: 41_000, retailRate: 52_000, warrantyApplicable: true, warrantyRate: 46_000,
    stock: { main: { quantity: 2, minimum: 2, rack: "IGN-03" }, second: { quantity: 5, minimum: 2, rack: "IGN-03" } },
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

export type ServiceTypeCode = "RG" | "RR";

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
  target: "OPEN" | "IN_PROGRESS" | "READY" | "BILLED_PAID" | "BILLED_CREDIT";
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
