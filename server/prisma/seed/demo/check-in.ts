import { crc32, deflateSync } from "zlib";
import prisma from "../../../src/prisma/client";
import { CHECKLIST_ITEMS } from "../../../src/modules/service/job-check-in.logic";
import { JobCheckInService } from "../../../src/modules/service/job-check-in.service";
import { getSignedOpeningConsent, signJobOpening } from "../../../src/modules/service/job-opening-signature.service";
import { createBooking } from "../../../src/modules/service/booking.persistence";
import { demoUuid, type JobFixture } from "./fixtures";
import type { DemoContext, Reference } from "./context";
import type { Parties } from "./parties";

/**
 * Check-in for demo jobs (job card revamp phase 2), recorded through the check-in service as the
 * advisor would on screen. Re-runs are safe: each part is skipped once it is recorded.
 */

const checkIn = new JobCheckInService();

/** How far check-in has got for a job that stays at check-in. */
export type CheckInLevel = "opened" | "walkAround" | "signed";

/** A fictional handwritten-style signature drawn as a PNG line, within the signature limits. */
export function demoSignaturePng(): string {
  const width = 300;
  const height = 80;
  const pixels = Buffer.alloc(height * (1 + width * 4));
  for (let x = 20; x < width - 20; x++) {
    const y = Math.round(40 + 18 * Math.sin(x / 14) * Math.cos(x / 41));
    for (let dy = -1; dy <= 1; dy++) {
      const offset = (y + dy) * (1 + width * 4) + 1 + x * 4;
      pixels[offset + 3] = 255; // opaque black ink
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function advisorActor(advisorId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: advisorId }, select: { id: true, role: { select: { name: true } } } });
  return { id: user.id, role: user.role.name };
}

/**
 * The advisor's walk-around: half a tank, hub caps missing, AC not working, the service book
 * seen with three stamps, an umbrella left in the boot, a scratch on the rear bumper and a dent
 * on the front right door. Instructions to the technician are added on Details.
 */
async function recordWalkAround(fx: JobFixture, jobCardId: string, advisorId: string) {
  const actor = await advisorActor(advisorId);
  const current = await prisma.jobCheckIn.findUnique({ where: { jobCardId }, select: { version: true, instructionsToTechnician: true } });
  if (!current?.instructionsToTechnician) {
    const job = await prisma.jobCard.findUniqueOrThrow({
      where: { id: jobCardId },
      select: { customerId: true, mileage: true, serviceTypeId: true, promisedAt: true, complaints: { orderBy: { id: "asc" } } },
    });
    await checkIn.saveDetails(
      jobCardId,
      {
        customerId: job.customerId,
        mileage: job.mileage,
        serviceTypeId: job.serviceTypeId,
        promisedAt: job.promisedAt?.toISOString(),
        complaints: job.complaints.map((row) => ({ description: row.description, complaintCodeId: row.complaintCodeId, spare: Number(row.spare), oil: Number(row.oil), labour: Number(row.labour) })),
        instructionsToTechnician: `Check each customer request: ${fx.complaints.join("; ")}.`,
      },
      actor,
    );
  }
  const record = await prisma.jobCheckIn.findUnique({ where: { jobCardId }, select: { version: true, fuelLevel: true } });
  if (!record?.fuelLevel)
    await checkIn.saveWalkAround(
      jobCardId,
      {
        expectedVersion: record?.version ?? 0,
        fuelLevel: "HALF",
        checklist: { ...Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.code, "PRESENT"])), HUB_CAPS: "MISSING", AC_WORKING: "NOT_WORKING" },
        checklistNote: null,
        serviceBookSeen: true,
        serviceBookStamps: 3,
        noValuables: true,
        belongingsNote: "Umbrella in boot",
      },
      actor,
    );
  await checkIn.addDamageMark(jobCardId, { requestId: demoUuid(`mark:${fx.id}:rear`), type: "SCRATCH", x: 50, y: 94, note: "Light scratch" }, actor);
  await checkIn.addDamageMark(jobCardId, { requestId: demoUuid(`mark:${fx.id}:door`), type: "DENT", x: 80, y: 42, note: null }, actor);
}

/** The owner (or the fixture's representative) signs the customer consent on the advisor's tablet. */
async function signConsent(fx: JobFixture, jobCardId: string, advisorId: string) {
  if (await prisma.jobOpeningSignature.findFirst({ where: { jobCardId }, select: { id: true } })) return;
  const consent = await getSignedOpeningConsent(jobCardId);
  await signJobOpening(
    jobCardId,
    {
      accepted: true,
      expectedHash: consent.expectedHash,
      idempotencyKey: demoUuid(`consent:${fx.id}`),
      // Delivery (phase 9): a representative signs for the owner on some demo jobs.
      ...(fx.delivery?.representative
        ? { signerName: fx.delivery.representative.name, relationship: fx.delivery.representative.relationship, signerPhone: fx.delivery.representative.phone }
        : { signerName: consent.document.scope.customerName }),
      signatureImage: demoSignaturePng(),
    },
    advisorId,
  );
}

/**
 * Records check-in before the job leaves it. Jobs seeded today are signed for real. Historical
 * scenario jobs are re-dated after seeding, which changes the opening date the customer signed,
 * so they are recorded like jobs from before signed consent existed.
 * TODO(confirm): re-dating keeps the historical reports' dates; their consent shows "Not provided".
 */
export async function completeCheckIn(fx: JobFixture, jobCardId: string, advisorId: string, level: CheckInLevel = "signed") {
  if (level === "opened") return;
  await recordWalkAround(fx, jobCardId, advisorId);
  if (level !== "signed") return;
  if (fx.startDaysAgo === 0) await signConsent(fx, jobCardId, advisorId);
  else await prisma.jobCard.update({ where: { id: jobCardId }, data: { openingSignatureRequired: false } });
}

/**
 * Bookings ready to open as job cards: KJA-523ST for the "open a job from a booking" test (phase 2) and
 * LSR-549ST for the full journey (phase 12). A vehicle that already has an open booking is left alone.
 */
export async function seedStageBooking(ctx: DemoContext, ref: Reference, parties: Parties) {
  const bookings = [
    { vehicle: parties.vehicles.stgBooking, mileage: 21_400, lastMileage: 16_050, requests: ["Periodic service (20,000 km)", "Rattle from the rear when driving over bumps"] },
    { vehicle: parties.vehicles.stgJourney, mileage: 18_900, lastMileage: 14_200, requests: ["Periodic service (20,000 km)", "Engine shakes when cold in the morning"] },
  ];
  const staff = ctx.staff.main;
  for (const booking of bookings) {
    const { vehicle } = booking;
    const existing = await prisma.serviceAppointment.findFirst({ where: { vehicleId: vehicle.id, bookingStatus: "BOOKED" }, select: { id: true } });
    if (existing) continue;
    await prisma.vehicle.updateMany({
      where: { id: vehicle.id, lastRecordedMileage: null },
      data: { lastRecordedMileage: booking.lastMileage, lastMileageAt: new Date(Date.now() - 120 * 86_400_000) },
    });
    await createBooking({
      customerId: vehicle.customerId!,
      vehicleId: vehicle.id,
      branchId: ctx.branches.main.id,
      serviceTypeId: ref.serviceTypes.RG,
      mileage: booking.mileage,
      scheduledAt: new Date(Date.now() + 2 * 3_600_000),
      requests: booking.requests.map((description) => ({ description })),
      createdById: staff.advisor.id,
    });
  }
}
