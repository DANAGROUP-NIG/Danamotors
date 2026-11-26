import { createHash } from "crypto";
import { z } from "zod";

/**
 * Check-in (job card revamp phase 2): the service advisor's Details, Walk-around and Customer
 * consent. Pure rules only; job-check-in.service.ts does the database work.
 */

/** The 25 accessories on the paper job card, in the paper card's order. */
export const CHECKLIST_ITEMS = [
  { code: "SERVICE_BOOK", label: "Service book" },
  { code: "REGISTRATION_DOCUMENTS", label: "Registration documents" },
  { code: "JACK_AND_HANDLE", label: "Jack and handle" },
  { code: "TOOL_KIT", label: "Tool kit" },
  { code: "FLOOR_MATS", label: "Floor mats" },
  { code: "MUD_FLAPS", label: "Mud flaps" },
  { code: "HUB_CAPS", label: "Hub caps" },
  { code: "STEREO", label: "Stereo" },
  { code: "SPEAKERS", label: "Speakers" },
  { code: "ANTENNA", label: "Antenna" },
  { code: "CLOCK", label: "Clock" },
  { code: "SIDE_MIRRORS", label: "Side mirrors" },
  { code: "HEADLAMPS", label: "Headlamps" },
  { code: "INDICATORS", label: "Indicators" },
  { code: "BRAKE_LIGHTS", label: "Brake lights" },
  { code: "AC_WORKING", label: "AC working" },
  { code: "POWER_WINDOWS", label: "Power windows" },
  { code: "CENTRAL_LOCK", label: "Central lock" },
  { code: "REVERSE_LAMP", label: "Reverse lamp" },
  { code: "WIPER_BLADES", label: "Wiper blades" },
  { code: "SPARE_WHEEL", label: "Spare wheel" },
  { code: "MONOGRAM", label: "Monogram" },
  { code: "BATTERY", label: "Battery" },
  { code: "ENGINE_WARNING_LAMP", label: "Engine warning lamp" },
  { code: "FIRE_EXTINGUISHER", label: "Fire extinguisher" },
] as const;

export type ChecklistCode = (typeof CHECKLIST_ITEMS)[number]["code"];
export const CHECKLIST_STATES = ["PRESENT", "MISSING", "NOT_WORKING"] as const;
export type ChecklistState = (typeof CHECKLIST_STATES)[number];
export type Checklist = Partial<Record<ChecklistCode, ChecklistState>>;

export const FUEL_LEVELS = ["EMPTY", "QUARTER", "HALF", "THREE_QUARTER", "FULL"] as const;
export const DAMAGE_TYPES = ["CRACK", "DENT", "SCRATCH"] as const;
/** The five walk-around photo slots. */
export const CHECK_IN_PHOTO_SLOTS = ["FRONT", "REAR", "LEFT", "RIGHT", "ODOMETER"] as const;
export type CheckInPhotoSlot = (typeof CHECK_IN_PHOTO_SLOTS)[number];

const checklistState = z.enum(CHECKLIST_STATES, {
  errorMap: () => ({ message: "Choose Present, Missing or Not working for each checklist item" }),
});

/** Keyed by item code. Unknown codes are refused, so the stored JSON always matches the 25 items. */
export const checklistSchema = z
  .object(
    Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.code, checklistState.optional()])) as Record<
      ChecklistCode,
      z.ZodOptional<typeof checklistState>
    >,
  )
  .strict("The checklist has an item that is not on the job card. Reload the page and try again.");

/** Reads stored checklist JSON safely; anything unexpected is ignored rather than shown. */
export function readChecklist(value: unknown): Checklist {
  const parsed = checklistSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;
  const result: Checklist = {};
  if (value && typeof value === "object")
    for (const item of CHECKLIST_ITEMS) {
      const state = (value as Record<string, unknown>)[item.code];
      if (typeof state === "string" && (CHECKLIST_STATES as readonly string[]).includes(state))
        result[item.code] = state as ChecklistState;
    }
  return result;
}

export const uncheckedItems = (checklist: Checklist) => CHECKLIST_ITEMS.filter((item) => !checklist[item.code]);

const optionalText = (max: number, field: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${field} to ${max} characters`)
    .nullish()
    .transform((value) => value || null);

/** Autosaved walk-around draft. The whole draft is sent each time, so a retry is harmless. */
export const walkAroundBody = z
  .object({
    expectedVersion: z.number({ invalid_type_error: "Reload the page and try again" }).int().min(0),
    fuelLevel: z.enum(FUEL_LEVELS, { errorMap: () => ({ message: "Choose a fuel level" }) }).nullable(),
    checklist: checklistSchema,
    checklistNote: optionalText(1000, "the checklist notes"),
    serviceBookSeen: z.boolean(),
    serviceBookStamps: z
      .number({ invalid_type_error: "Enter the number of stamps as a whole number" })
      .int("Enter the number of stamps as a whole number")
      .min(0, "Stamps cannot be below 0")
      .max(12, "Enter 12 stamps or fewer for this warranty year")
      .nullable(),
    noValuables: z.boolean(),
    belongingsNote: optionalText(500, "the items left in the vehicle"),
  })
  .strict()
  // Stamps are counted only from a service book the advisor has seen.
  .transform((body) => ({ ...body, serviceBookStamps: body.serviceBookSeen ? body.serviceBookStamps : null }));
export type WalkAroundInput = z.infer<typeof walkAroundBody>;

/** Percentages of the diagram, 0 to 100 with at most two decimal places. */
const coordinate = (axis: "x" | "y") =>
  z
    .number({ invalid_type_error: `Tap the car diagram to place the mark (${axis} position missing)` })
    .finite()
    .min(0, "Place the mark on the car diagram")
    .max(100, "Place the mark on the car diagram")
    .transform((value) => Math.round(value * 100) / 100);

export const damageMarkBody = z
  .object({
    requestId: z.string().uuid("Reload the page and try again"),
    type: z.enum(DAMAGE_TYPES, { errorMap: () => ({ message: "Choose Crack, Dent or Scratch" }) }),
    x: coordinate("x"),
    y: coordinate("y"),
    note: optionalText(300, "the damage note"),
    photoId: z.string().uuid("Choose a photo saved on this job").nullish().transform((value) => value ?? null),
  })
  .strict();
export type DamageMarkInput = z.infer<typeof damageMarkBody>;

export const detailsBody = z
  .object({
    customerId: z.string().uuid("Choose who pays the bill"),
    mileage: z
      .number({ required_error: "Enter the current mileage", invalid_type_error: "Enter the current mileage" })
      .int("Enter the mileage as a whole number of kilometres")
      .min(0, "Mileage cannot be negative")
      .max(2_000_000, "Check the mileage. It is higher than 2,000,000 km"),
    odometerReplaced: z.boolean().optional(),
    odometerReplacedReason: z.string().trim().max(300, "Keep the reason to 300 characters").optional(),
    serviceTypeId: z.string({ required_error: "Choose the service type" }).uuid("Choose the service type"),
    promisedAt: z.string({ required_error: "Set the promised delivery date and time" }).datetime({
      offset: true,
      message: "Set the promised delivery date and time",
    }),
    complaints: z
      .array(
        z
          .object({
            description: z.string().trim().min(1, "Enter the customer request").max(2000, "Keep each request to 2,000 characters"),
            complaintCodeId: z.string().uuid("Choose a complaint code from the list").nullish(),
            spare: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
            oil: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
            labour: z.number().min(0).max(1e12).multipleOf(0.01).optional(),
          })
          .strict(),
      )
      .min(1, "Add at least one customer request")
      .max(100, "A job can have up to 100 customer requests"),
    instructionsToTechnician: optionalText(2000, "the instructions to the technician"),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.odometerReplaced && !body.odometerReplacedReason?.trim())
      ctx.addIssue({ code: "custom", path: ["odometerReplacedReason"], message: "Give a reason for the odometer replacement" });
  });
export type DetailsInput = z.infer<typeof detailsBody>;

/** Photos are stored as bytes in the database, so they stay small. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_DIMENSION = 4096;
/** A base64 data URL for the largest allowed photo, plus its header. */
const PHOTO_DATA_URL_LIMIT = Math.ceil((PHOTO_MAX_BYTES * 4) / 3) + 64;

export const photoBody = z
  .object({
    requestId: z.string().uuid("Reload the page and try again"),
    category: z.enum(["CHECK_IN", "DAMAGE"], { errorMap: () => ({ message: "Choose where the photo belongs" }) }),
    slot: z.enum(CHECK_IN_PHOTO_SLOTS, { errorMap: () => ({ message: "Choose Front, Rear, Left, Right or Odometer" }) }).nullish(),
    image: z.string().max(PHOTO_DATA_URL_LIMIT, "The photo is too large. Use a photo under 2 MB"),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.category === "CHECK_IN" && !body.slot)
      ctx.addIssue({ code: "custom", path: ["slot"], message: "Choose Front, Rear, Left, Right or Odometer" });
    if (body.category === "DAMAGE" && body.slot)
      ctx.addIssue({ code: "custom", path: ["slot"], message: "Damage photos do not use a slot" });
  });

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

export class PhotoProblem extends Error {}

/** Reads the width and height from a JPEG, PNG or WebP header. Returns null when the header is not readable. */
export function imageSize(bytes: Buffer, type: PhotoType): { width: number; height: number } | null {
  if (type === "image/png") {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.toString("ascii", 12, 16) !== "IHDR")
      return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (type === "image/webp") {
    if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // Start-of-frame markers carry the size (C0 to CF, except C4, C8 and CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return null;
}

/** Checks a photo data URL: JPEG, PNG or WebP, at most 2 MB and 4096 pixels a side. */
export function decodePhoto(image: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new PhotoProblem("Choose a JPEG, PNG or WebP photo");
  const contentType = match[1] as PhotoType;
  const data = Buffer.from(match[2], "base64");
  if (data.length > PHOTO_MAX_BYTES) throw new PhotoProblem("The photo is too large. Use a photo under 2 MB");
  const size = imageSize(data, contentType);
  if (!size || size.width < 1 || size.height < 1) throw new PhotoProblem("The photo could not be read. Take it again");
  if (size.width > PHOTO_MAX_DIMENSION || size.height > PHOTO_MAX_DIMENSION)
    throw new PhotoProblem("The photo is too large. Use a photo up to 4096 pixels wide and high");
  return { contentType, data, ...size, sha256: createHash("sha256").update(data).digest("hex") };
}

export interface CheckInGateFacts {
  mileage: number | null;
  serviceTypeId: string | null;
  promisedAt: Date | null;
  complaintCount: number;
  fuelLevel: string | null;
  checklist: Checklist;
  /** "signed" or "legacy" meet the gate; anything else needs a signature. */
  consentState: "legacy" | "required" | "signed" | "stale" | "invalid";
}

export interface CheckInGates {
  details: string[];
  walkAround: string[];
  consent: string[];
}

/** Why the job cannot leave check-in yet, grouped by the step that fixes it. Each reason names the step. */
export function checkInGates(facts: CheckInGateFacts, now: Date): CheckInGates {
  const details: string[] = [];
  if (facts.mileage == null) details.push("Enter the current mileage on Details.");
  if (!facts.serviceTypeId) details.push("Choose the service type on Details.");
  if (!facts.promisedAt) details.push("Set the promised delivery on Details.");
  else if (facts.promisedAt <= now) details.push("The promised delivery has passed. Set a new promised delivery on Details.");
  if (facts.complaintCount < 1) details.push("Add at least one customer request on Details.");

  const walkAround: string[] = [];
  if (!facts.fuelLevel) walkAround.push("Record the fuel level on Walk-around.");
  const unchecked = uncheckedItems(facts.checklist).length;
  if (unchecked > 0)
    walkAround.push(
      `Check every checklist item on Walk-around (${unchecked} not checked).`,
    );

  const consent: string[] = [];
  if (facts.consentState === "stale")
    consent.push("Details changed after the customer signed. Ask the customer to sign again on Customer consent.");
  else if (facts.consentState === "invalid")
    consent.push("The saved signature could not be verified. Ask the customer to sign again on Customer consent.");
  else if (facts.consentState === "required") consent.push("Get the customer's signature on Customer consent.");
  return { details, walkAround, consent };
}

export const allGateReasons = (gates: CheckInGates) => [...gates.details, ...gates.walkAround, ...gates.consent];

export type CheckInStep = "DETAILS" | "WALK_AROUND" | "CUSTOMER_CONSENT" | "SEND_TO_WORKSHOP";

/** The first check-in step that still needs work. */
export function checkInStep(gates: CheckInGates): CheckInStep {
  if (gates.details.length) return "DETAILS";
  if (gates.walkAround.length) return "WALK_AROUND";
  if (gates.consent.length) return "CUSTOMER_CONSENT";
  return "SEND_TO_WORKSHOP";
}

/** The mileage must not go below the reading recorded before this visit, unless the odometer was replaced. */
export function mileageProblem(mileage: number, previous: number | null, odometerReplaced: boolean | undefined): string | null {
  if (previous == null || mileage >= previous || odometerReplaced) return null;
  return `Mileage cannot be lower than the last recorded ${previous.toLocaleString("en-NG")} km. Check the reading, or tick Odometer replaced and give a reason.`;
}

const snapshotText = z.string();
/** The walk-around as the customer signed it. Part of the signed job-opening document from version 2. */
export const checkInSnapshotSchema = z
  .object({
    fuelLevel: z.enum(FUEL_LEVELS).nullable(),
    checklist: z.array(z.object({ code: snapshotText, label: snapshotText, state: z.enum(CHECKLIST_STATES).nullable() }).strict()),
    checklistNote: snapshotText.nullable(),
    serviceBookSeen: z.boolean(),
    serviceBookStamps: z.number().int().nullable(),
    noValuables: z.boolean(),
    belongingsNote: snapshotText.nullable(),
    damageMarks: z.array(
      z
        .object({
          id: snapshotText,
          type: z.enum(DAMAGE_TYPES),
          x: z.number(),
          y: z.number(),
          note: snapshotText.nullable(),
          photoId: snapshotText.nullable(),
        })
        .strict(),
    ),
    photos: z.array(z.object({ id: snapshotText, category: snapshotText, slot: snapshotText.nullable(), sha256: snapshotText }).strict()),
  })
  .strict();
export type CheckInSnapshot = z.infer<typeof checkInSnapshotSchema>;

export interface CheckInRecordFacts {
  fuelLevel: string | null;
  checklist: unknown;
  checklistNote: string | null;
  serviceBookSeen: boolean;
  serviceBookStamps: number | null;
  noValuables: boolean;
  belongingsNote: string | null;
}

/**
 * Builds the snapshot in a fixed order (marks by time then id, photos by id), so the same
 * walk-around always hashes the same. Coordinates are rounded to two decimals.
 */
export function checkInSnapshot(
  record: CheckInRecordFacts | null,
  marks: { id: string; type: string; x: { toString(): string } | number; y: { toString(): string } | number; note: string | null; photoId: string | null; createdAt: Date }[],
  photos: { id: string; category: string; slot: string | null; sha256: string }[],
): CheckInSnapshot {
  const checklist = readChecklist(record?.checklist);
  const number = (value: { toString(): string } | number) => Math.round(Number(value.toString()) * 100) / 100;
  return checkInSnapshotSchema.parse({
    fuelLevel: record?.fuelLevel ?? null,
    checklist: CHECKLIST_ITEMS.map((item) => ({ code: item.code, label: item.label, state: checklist[item.code] ?? null })),
    checklistNote: record?.checklistNote ?? null,
    serviceBookSeen: record?.serviceBookSeen ?? false,
    serviceBookStamps: record?.serviceBookStamps ?? null,
    noValuables: record?.noValuables ?? false,
    belongingsNote: record?.belongingsNote ?? null,
    damageMarks: [...marks]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id, "en"))
      .map((mark) => ({ id: mark.id, type: mark.type, x: number(mark.x), y: number(mark.y), note: mark.note, photoId: mark.photoId })),
    photos: [...photos]
      .sort((a, b) => a.id.localeCompare(b.id, "en"))
      .map((photo) => ({ id: photo.id, category: photo.category, slot: photo.slot, sha256: photo.sha256 })),
  });
}

/** True when the requests to save differ from the job's, in order and content (amounts kept as they are). */
export function requestsChanged(
  current: { description: string; complaintCodeId: string | null }[],
  next: { description: string; complaintCodeId?: string | null }[],
): boolean {
  if (current.length !== next.length) return true;
  return current.some(
    (row, index) => row.description.trim() !== next[index].description.trim() || (row.complaintCodeId ?? null) !== (next[index].complaintCodeId ?? null),
  );
}
