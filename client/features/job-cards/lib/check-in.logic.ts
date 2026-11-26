/**
 * Check-in (job card revamp phase 2): pure rules for the Details, Walk-around and Customer
 * consent steps. Components only render what these return.
 */
import type { StatusTone } from "@/components/ui/table-components/StatusBadge";
import { formatDate, formatKm, NOT_PROVIDED } from "@/lib/format";
import type {
  CheckInGates,
  CheckInServiceHistory,
  CheckInPhotoSlot,
  CheckInStepKey,
  Checklist,
  ChecklistItem,
  ChecklistState,
  DamageMark,
  DamageType,
  FuelLevel,
  JobCheckIn,
} from "../types/job-check-in.types";
import { serviceHistoryAlert } from "./warranty-check.logic";

export const CHECK_IN_STEPS: { key: CheckInStepKey; label: string; gate: keyof CheckInGates }[] = [
  { key: "DETAILS", label: "Details", gate: "details" },
  { key: "WALK_AROUND", label: "Walk-around", gate: "walkAround" },
  { key: "CUSTOMER_CONSENT", label: "Customer consent", gate: "consent" },
];

/** The step to open first: the first one with work left, or consent once everything is done. */
export function firstOpenStep(checkIn: Pick<JobCheckIn, "step">): CheckInStepKey {
  return checkIn.step === "SEND_TO_WORKSHOP" ? "CUSTOMER_CONSENT" : checkIn.step;
}

export interface StepView {
  key: CheckInStepKey;
  label: string;
  done: boolean;
  current: boolean;
  /** "Step 2 of 3: Walk-around, complete" for screen readers. */
  accessibleLabel: string;
}

export function checkInStepViews(gates: CheckInGates, current: CheckInStepKey): StepView[] {
  return CHECK_IN_STEPS.map((step, index) => {
    const done = gates[step.gate].length === 0;
    return {
      key: step.key,
      label: step.label,
      done,
      current: step.key === current,
      accessibleLabel: `Step ${index + 1} of 3: ${step.label}, ${done ? "complete" : "not complete"}`,
    };
  });
}

export const FUEL_OPTIONS: { value: FuelLevel; short: string; label: string }[] = [
  { value: "EMPTY", short: "E", label: "Empty" },
  { value: "QUARTER", short: "1/4", label: "Quarter" },
  { value: "HALF", short: "1/2", label: "Half" },
  { value: "THREE_QUARTER", short: "3/4", label: "Three quarters" },
  { value: "FULL", short: "Full", label: "Full" },
];

/** "Half (1/2)", or "Not provided". */
export function fuelLabel(level: FuelLevel | null | undefined): string {
  const option = FUEL_OPTIONS.find((item) => item.value === level);
  if (!option) return NOT_PROVIDED;
  return option.short === option.label ? option.label : `${option.label} (${option.short})`;
}

/** One mapping for checklist states, shown with StatusBadge tones (word and colour together). */
export const CHECKLIST_STATE_VIEW: Record<ChecklistState | "UNSET", { label: string; tone: StatusTone }> = {
  PRESENT: { label: "Present", tone: "emerald" },
  MISSING: { label: "Missing", tone: "red" },
  NOT_WORKING: { label: "Not working", tone: "amber" },
  UNSET: { label: "Not checked", tone: "gray" },
};

const CYCLE: ChecklistState[] = ["PRESENT", "MISSING", "NOT_WORKING"];

/** A tap moves Not checked to Present, then Missing, Not working and back to Present. */
export function nextChecklistState(state: ChecklistState | undefined): ChecklistState {
  if (!state) return "PRESENT";
  return CYCLE[(CYCLE.indexOf(state) + 1) % CYCLE.length];
}

/** Marks every item not yet checked as present; items already set are kept. */
export function markRestPresent(checklist: Checklist, items: ChecklistItem[]): Checklist {
  const next: Checklist = { ...checklist };
  for (const item of items) if (!next[item.code]) next[item.code] = "PRESENT";
  return next;
}

export function checklistCounts(checklist: Checklist, items: ChecklistItem[]) {
  const counts = { PRESENT: 0, MISSING: 0, NOT_WORKING: 0, UNSET: 0 };
  for (const item of items) counts[checklist[item.code] ?? "UNSET"] += 1;
  return counts;
}

const labelsIn = (checklist: Checklist, items: ChecklistItem[], state: ChecklistState) =>
  items.filter((item) => checklist[item.code] === state).map((item) => item.label);

/** "Hub caps, Stereo", or "None". Item names keep their own capitals (AC working). */
export function itemsInState(checklist: Checklist, items: ChecklistItem[], state: ChecklistState): string {
  const labels = labelsIn(checklist, items, state);
  return labels.length ? labels.join(", ") : "None";
}

export const DAMAGE_VIEW: Record<DamageType, { letter: string; label: string }> = {
  CRACK: { letter: "C", label: "Crack" },
  DENT: { letter: "D", label: "Dent" },
  SCRATCH: { letter: "S", label: "Scratch" },
};
export const DAMAGE_TYPES: DamageType[] = ["CRACK", "DENT", "SCRATCH"];

/**
 * The part of the car under a point on the top-down diagram (front at the top, the car's
 * left on the left). Percentages of the diagram.
 */
export function damageArea(x: number, y: number): string {
  if (y < 9) return "front bumper";
  if (y >= 91) return "rear bumper";
  const side = x < 30 ? "left" : x > 70 ? "right" : null;
  if (side) {
    if (y < 30) return `front ${side} wing`;
    if (y < 50) return `front ${side} door`;
    if (y < 70) return `rear ${side} door`;
    return `rear ${side} quarter panel`;
  }
  if (y < 28) return "bonnet";
  if (y < 36) return "windscreen";
  if (y < 64) return "roof";
  if (y < 72) return "rear window";
  return "boot lid";
}

/** "Dent on front right door" */
export function damageLine(mark: Pick<DamageMark, "type" | "x" | "y">): string {
  return `${DAMAGE_VIEW[mark.type].label} on ${damageArea(mark.x, mark.y)}`;
}

/** "Scratch on rear bumper, dent on front right door", or "No damage noted". */
export function damageSentence(marks: Pick<DamageMark, "type" | "x" | "y">[]): string {
  if (!marks.length) return "No damage noted";
  // Later lines start lower case: the damage type is the only capitalised word in each.
  return marks.map(damageLine).map((line, index) => (index === 0 ? line : line.charAt(0).toLowerCase() + line.slice(1))).join(", ");
}

/** A tap on the diagram as percentages, clamped to the diagram and rounded to two decimals. */
export function tapPosition(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) {
  const percent = (value: number, start: number, size: number) =>
    size > 0 ? Math.round(Math.min(100, Math.max(0, ((value - start) / size) * 100)) * 100) / 100 : 0;
  return { x: percent(clientX, rect.left, rect.width), y: percent(clientY, rect.top, rect.height) };
}

/** Moves a keyboard-placed marker by a step, kept on the diagram. */
export function nudge(position: { x: number; y: number }, key: string, step = 2): { x: number; y: number } | null {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  switch (key) {
    case "ArrowLeft":
      return { ...position, x: clamp(position.x - step) };
    case "ArrowRight":
      return { ...position, x: clamp(position.x + step) };
    case "ArrowUp":
      return { ...position, y: clamp(position.y - step) };
    case "ArrowDown":
      return { ...position, y: clamp(position.y + step) };
    default:
      return null;
  }
}

export const PHOTO_SLOT_LABELS: Record<CheckInPhotoSlot, string> = {
  FRONT: "Front",
  REAR: "Rear",
  LEFT: "Left",
  RIGHT: "Right",
  ODOMETER: "Odometer",
};

const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lagos" });

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "error"; message: string } | { kind: "conflict" };

/** The words beside the walk-around: "Saving", "Saved 10:42", or what went wrong. */
export function saveStateText(state: SaveState): string {
  switch (state.kind) {
    case "idle":
      return "No changes yet";
    case "saving":
      return "Saving";
    case "saved":
      return `Saved ${time.format(new Date(state.at))}`;
    case "error":
      return `Not saved. ${state.message}`;
    case "conflict":
      return "Not saved. The walk-around was changed on another screen.";
  }
}

/** "Last recorded 43,100 km on 12 Aug 2026", or nothing when there is no earlier reading. */
export function previousReadingText(reading: JobCheckIn["previousReading"]): string | null {
  if (!reading) return null;
  return reading.at ? `Last recorded ${formatKm(reading.km)} on ${formatDate(reading.at)}` : `Last recorded ${formatKm(reading.km)}`;
}

/** The same rule the server applies, so the message appears before saving. */
export function mileageProblem(mileage: number | null | undefined, previous: number | null | undefined, odometerReplaced: boolean | undefined): string | null {
  if (mileage == null || previous == null || mileage >= previous || odometerReplaced) return null;
  return `Mileage cannot be lower than the last recorded ${formatKm(previous)}. Check the reading, or tick Odometer replaced and give a reason.`;
}

/** A Lagos date (YYYY-MM-DD) and 24-hour time (HH:mm) as an ISO time with the Lagos offset. */
export function lagosDateTime(date: string, timeValue: string): string {
  return `${date}T${timeValue}:00+01:00`;
}

/** The Lagos date and time parts of an ISO time, for the date and time pickers. */
export function lagosParts(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return { date: "", time: "" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(parsed)
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Today's date in Lagos, the earliest promised delivery date. */
export function lagosToday(now: Date = new Date()): string {
  return lagosParts(now.toISOString()).date;
}

/** A tablet photo can be large; it is resized to this many pixels on its longest side before upload. */
export const PHOTO_MAX_SIDE = 1600;
/** Matches the server limit of 2 MB. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** The size to draw a photo at, keeping its shape and never enlarging it. */
export function fitPhoto(width: number, height: number, maxSide = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Approximate decoded size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

export function belongingsText(record: { noValuables: boolean; belongingsNote: string | null }): string {
  const note = record.belongingsNote?.trim();
  if (record.noValuables) return note ? `No valuables. Items left: ${note}` : "No valuables left in the vehicle";
  return note ? `Items left: ${note}` : NOT_PROVIDED;
}

/** The checklist states a version 2 signed document recorded, keyed by item code. */
export function checklistFromSigned(rows: { code: string; state: ChecklistState | null }[]): Checklist {
  return Object.fromEntries(rows.filter((row) => row.state).map((row) => [row.code, row.state ?? undefined]));
}

/** "Signed by Adaeze Okafor, 25 Nov 2026, 09:40" for the owner; a representative also shows their relationship. */
export function signedLine(signature: { signerName: string; relationship: string | null }, when: string): string {
  return signature.relationship
    ? `Signed by ${signature.signerName} (${signature.relationship}), ${when}`
    : `Signed by ${signature.signerName}, ${when}`;
}

export interface DetailsValues {
  vehicleId?: string;
  customerId: string;
  mileage: number;
  odometerReplaced?: boolean;
  odometerReplacedReason?: string;
  serviceTypeId: string;
  promisedDate: string;
  promisedTime: string;
  complaints: { description: string; complaintCodeId?: string; spare: number; oil: number; labour: number }[];
  instructionsToTechnician?: string;
  previousMileage?: number | null;
}

interface DetailsJob {
  vehicleId?: string;
  customerId?: string | null;
  mileage?: number | null;
  serviceTypeId?: string | null;
  promisedAt?: string | null;
  complaints?: { description: string; complaintCodeId?: string | null; spare?: number; oil?: number; labour?: number }[];
}

/** The Details form as the job holds it now. Amounts on each request are carried, never shown. */
export function detailsDefaults(job: DetailsJob, checkIn: Pick<JobCheckIn, "record" | "previousReading">): DetailsValues {
  const promised = lagosParts(job.promisedAt);
  return {
    vehicleId: job.vehicleId ?? "",
    customerId: job.customerId ?? "",
    mileage: job.mileage ?? (undefined as unknown as number),
    odometerReplaced: false,
    odometerReplacedReason: "",
    serviceTypeId: job.serviceTypeId ?? "",
    promisedDate: promised.date,
    promisedTime: promised.time,
    complaints: (job.complaints ?? []).map((row) => ({
      description: row.description,
      complaintCodeId: row.complaintCodeId ?? "",
      spare: row.spare ?? 0,
      oil: row.oil ?? 0,
      labour: row.labour ?? 0,
    })),
    instructionsToTechnician: checkIn.record.instructionsToTechnician ?? "",
    previousMileage: checkIn.previousReading?.km ?? null,
  };
}

/** What PUT /check-in/details takes. */
export function detailsPayload(values: DetailsValues) {
  return {
    customerId: values.customerId,
    mileage: values.mileage,
    ...(values.odometerReplaced ? { odometerReplaced: true, odometerReplacedReason: values.odometerReplacedReason?.trim() } : {}),
    serviceTypeId: values.serviceTypeId,
    promisedAt: lagosDateTime(values.promisedDate, values.promisedTime),
    complaints: values.complaints.map((row) => ({
      description: row.description.trim(),
      complaintCodeId: row.complaintCodeId || null,
      spare: row.spare,
      oil: row.oil,
      labour: row.labour,
    })),
    instructionsToTechnician: values.instructionsToTechnician?.trim() || null,
  };
}

const SERVER_FIELDS: Record<string, keyof DetailsValues> = {
  customerId: "customerId",
  mileage: "mileage",
  odometerReplacedReason: "odometerReplacedReason",
  serviceTypeId: "serviceTypeId",
  promisedAt: "promisedTime",
  complaints: "complaints",
  instructionsToTechnician: "instructionsToTechnician",
};

/** The form field a server error belongs to ("body.promisedAt" is shown under the time). */
export function detailsErrorField(field: string | null | undefined): keyof DetailsValues | null {
  if (!field) return null;
  const name = field.replace(/^body\./, "").split(".")[0];
  return SERVER_FIELDS[name] ?? null;
}

export type DetailsAlert = { id: string; tone: "info" | "warning"; message: string; link?: { label: string; tab: "visits" | "warranty" } };

/**
 * Up to three notes for the advisor at check-in: repeat visit (from the repeat check at opening),
 * warranty cover when the job opened (with the service history verdict when services were missed),
 * and open campaigns.
 */
export function detailsAlerts(
  job: {
    isRepeat?: boolean;
    previousJob?: { jobNumber: string } | null;
    warrantyStatusAtCreation?: string | null;
    campaigns?: { campaignCode?: string; campaignTitle?: string }[];
  },
  lastVisit: { openedAt: string; service: string | null } | null,
  serviceHistory: CheckInServiceHistory | null = null,
): DetailsAlert[] {
  const alerts: DetailsAlert[] = [];
  if (job.isRepeat)
    alerts.push({
      id: "repeat",
      tone: "warning",
      message: job.previousJob ? `Repeat visit. This job repeats job ${job.previousJob.jobNumber}.` : "Repeat visit.",
      link: { label: "View history", tab: "visits" },
    });
  else
    alerts.push({
      id: "repeat",
      tone: "info",
      message: lastVisit
        ? `Not a repeat visit. Last visit ${formatDate(lastVisit.openedAt)}${lastVisit.service ? `, ${lastVisit.service.toLowerCase()}` : ""}.`
        : "Not a repeat visit. No earlier visit is recorded for this vehicle.",
    });
  if (job.warrantyStatusAtCreation === "ACTIVE")
    alerts.push({
      id: "warranty",
      tone: "warning",
      message:
        serviceHistoryAlert(serviceHistory, true) ?? "This vehicle is under warranty. Warranty items will need the warranty officer's review.",
      link: { label: "View warranty", tab: "warranty" },
    });
  const campaigns = (job.campaigns ?? []).map((campaign) => campaign.campaignCode ?? campaign.campaignTitle).filter((value): value is string => !!value);
  if (campaigns.length)
    alerts.push({
      id: "campaigns",
      tone: "warning",
      message: `Open campaign for this vehicle: ${campaigns.join(", ")}.`,
      link: { label: "View campaigns", tab: "warranty" },
    });
  return alerts.slice(0, 3);
}

export interface ConsentFormInput {
  accepted: boolean;
  signer: "OWNER" | "REPRESENTATIVE";
  name: string;
  phone: string;
  relationship: string;
  signature: string | null;
}

/** What still stops the customer signing, keyed by field. Empty when the form can be sent. */
export function consentFormProblems(input: ConsentFormInput): Partial<Record<"accepted" | "name" | "phone" | "relationship" | "signature", string>> {
  const problems: Partial<Record<"accepted" | "name" | "phone" | "relationship" | "signature", string>> = {};
  if (!input.accepted) problems.accepted = "Tick the box to accept the terms and conditions.";
  if (input.signer === "REPRESENTATIVE") {
    if (!input.name.trim()) problems.name = "Enter the name of the person signing.";
    if (!/^\+?[0-9 ()-]{7,20}$/.test(input.phone.trim())) problems.phone = "Enter the phone number of the person signing, for example 0803 555 0142.";
    if (!input.relationship.trim()) problems.relationship = "Enter how the person is related to the customer, for example driver or spouse.";
  }
  if (!input.signature) problems.signature = "Ask the customer to sign in the box.";
  return problems;
}
