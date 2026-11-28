/** Check-in, as returned by GET /service/job-cards/:id/check-in (job card revamp phase 2). */

export type FuelLevel = "EMPTY" | "QUARTER" | "HALF" | "THREE_QUARTER" | "FULL";
export type ChecklistState = "PRESENT" | "MISSING" | "NOT_WORKING";
export type Checklist = Record<string, ChecklistState | undefined>;
export type DamageType = "CRACK" | "DENT" | "SCRATCH";
export type CheckInPhotoSlot = "FRONT" | "REAR" | "LEFT" | "RIGHT" | "ODOMETER";
export type CheckInStepKey = "DETAILS" | "WALK_AROUND" | "CUSTOMER_CONSENT";
export type ConsentState = "legacy" | "required" | "signed" | "stale" | "invalid";

export interface ChecklistItem {
  code: string;
  label: string;
}

export interface CheckInGates {
  details: string[];
  walkAround: string[];
  consent: string[];
}

export interface DamageMark {
  id: string;
  type: DamageType;
  /** Percentages of the diagram, 0 to 100. */
  x: number;
  y: number;
  note: string | null;
  photoId: string | null;
}

export interface JobPhoto {
  id: string;
  category: "CHECK_IN" | "DAMAGE";
  slot: CheckInPhotoSlot | null;
  createdAt: string;
}

export interface WalkAroundDraft {
  fuelLevel: FuelLevel | null;
  checklist: Checklist;
  checklistNote: string | null;
  serviceBookSeen: boolean;
  serviceBookStamps: number | null;
  noValuables: boolean;
  belongingsNote: string | null;
}

export interface JobCheckIn {
  jobCardId: string;
  editable: boolean;
  readOnlyReason: string | null;
  step: CheckInStepKey | "SEND_TO_WORKSHOP";
  gates: CheckInGates;
  consentState: ConsentState;
  checklistItems: ChecklistItem[];
  photoSlots: CheckInPhotoSlot[];
  previousReading: { km: number; at: string | null } | null;
  vehicleOwner: { id: string; name: string } | null;
  /** The warranty service history verdict for this visit (phase 4). Null without a vehicle. */
  serviceHistory: CheckInServiceHistory | null;
  record: WalkAroundDraft & {
    instructionsToTechnician: string | null;
    version: number;
    savedAt: string | null;
    completedAt: string | null;
    completedBy: string | null;
  };
  damageMarks: DamageMark[];
  photos: JobPhoto[];
}

export interface CheckInDetailsInput {
  customerId: string;
  mileage: number;
  odometerReplaced?: boolean;
  odometerReplacedReason?: string;
  serviceTypeId: string;
  promisedAt: string;
  complaints: { description: string; complaintCodeId?: string | null; spare?: number; oil?: number; labour?: number }[];
  instructionsToTechnician: string | null;
}

export interface DamageMarkInput {
  requestId: string;
  type: DamageType;
  x: number;
  y: number;
  note?: string | null;
  photoId?: string | null;
}

export interface PhotoInput {
  requestId: string;
  category: "CHECK_IN" | "DAMAGE";
  slot?: CheckInPhotoSlot | null;
  image: string;
}

/** The walk-around inside a version 2 signed job-opening document. */
export interface SignedCheckIn {
  fuelLevel: FuelLevel | null;
  checklist: { code: string; label: string; state: ChecklistState | null }[];
  checklistNote: string | null;
  serviceBookSeen: boolean;
  serviceBookStamps: number | null;
  noValuables: boolean;
  belongingsNote: string | null;
  damageMarks: { id: string; type: DamageType; x: number; y: number; note: string | null; photoId: string | null }[];
  photos: { id: string; category: string; slot: string | null; sha256: string }[];
}

/** The service history verdict at check-in: REGULAR, IRREGULAR or INSUFFICIENT_DATA, and its sentence. */
export interface CheckInServiceHistory {
  verdict: "REGULAR" | "IRREGULAR" | "INSUFFICIENT_DATA";
  sentence: string;
}
