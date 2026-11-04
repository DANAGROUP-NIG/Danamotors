import { Prisma } from "@prisma/client";
import prisma from "../../../src/prisma/client";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const daysAgo = (days: number, now = new Date()) => new Date(now.getTime() - days * DAY_MS);

/** Prisma stores DateTime as UTC in `timestamp` columns; compare and write in the same form. */
const utc = (date: Date) => date.toISOString().replace("T", " ").replace("Z", "");
const parseUtc = (value: string) => new Date(`${value.replace(" ", "T")}Z`);

export interface JobWindow {
  startDaysAgo: number;
  spanHours: number;
}

/** A job is re-dated once, right after its scenario first completes. */
export function needsRetime(createdAt: Date, window: JobWindow, now = new Date()) {
  if (window.startDaysAgo <= 0) return false;
  const anchor = daysAgo(window.startDaysAgo, now);
  return createdAt.getTime() > anchor.getTime() + (window.spanHours + 1) * HOUR_MS;
}

/**
 * The seed builds each job card through the app's services, so every record is stamped
 * "now". This moves the whole job (status history, estimates and decisions, labour, part
 * issues and their stock movements, charge lines, bill and receipt, warranty case and
 * history, campaign completion) onto a window `startDaysAgo` days before the run, spread
 * over `spanHours`, keeping the order of events. Amounts and links are not touched.
 */
export async function retimeJob(jobCardId: string, window: JobWindow, promiseHours: number) {
  const [row] = await prisma.$queryRaw<{ t0: string }[]>`SELECT "createdAt"::text AS t0 FROM "JobCard" WHERE id = ${jobCardId}`;
  const realStart = parseUtc(row.t0);
  const realEnd = new Date();
  const anchor = daysAgo(window.startDaysAgo, realEnd);
  const scale = (window.spanHours * HOUR_MS) / Math.max(realEnd.getTime() - realStart.getTime(), 1);

  const t0 = utc(realStart);
  const at = utc(anchor);
  const mapped = (column: string) =>
    Prisma.sql`${at}::timestamp + (${Prisma.raw(`"${column}"`)} - ${t0}::timestamp) * ${scale}::float8`;
  const set = (columns: string[]) => Prisma.join(columns.map((c) => Prisma.sql`${Prisma.raw(`"${c}"`)} = ${mapped(c)}`), ", ");

  const estimateIds = Prisma.sql`SELECT id FROM "Estimate" WHERE "jobCardId" = ${jobCardId}`;
  const issuanceIds = Prisma.sql`SELECT id FROM "PartIssuance" WHERE "jobCardId" = ${jobCardId}`;
  const invoiceIds = Prisma.sql`SELECT id FROM "Invoice" WHERE "jobCardId" = ${jobCardId}`;
  const caseIds = Prisma.sql`SELECT id FROM "WarrantyCase" WHERE "jobCardId" = ${jobCardId}`;

  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "JobCardStatusHistory" SET ${set(["createdAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "Estimate" SET ${set(["createdAt", "updatedAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "CustomerApproval" SET ${set(["createdAt", "decisionDate"])} WHERE "estimateId" IN (${estimateIds})`,
    prisma.$executeRaw`UPDATE "JobCardLabour" SET ${set(["createdAt", "updatedAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "JobCardLine" SET ${set(["createdAt", "updatedAt", "chargeTypeChangedAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "StockTransaction" SET ${set(["createdAt"])} WHERE "referenceId" IN (${issuanceIds})`,
    prisma.$executeRaw`UPDATE "PartIssuance" SET ${set(["issuedAt", "createdAt", "updatedAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "InvoiceLine" SET ${set(["createdAt"])} WHERE "invoiceId" IN (${invoiceIds})`,
    prisma.$executeRaw`UPDATE "Receipt" SET ${set(["issuedAt", "createdAt", "updatedAt"])} WHERE id IN (SELECT "receiptId" FROM "ReceiptAllocation" WHERE "invoiceId" IN (${invoiceIds}))`,
    prisma.$executeRaw`UPDATE "ReceiptAllocation" SET ${set(["adjustedAt", "createdAt"])} WHERE "invoiceId" IN (${invoiceIds})`,
    // The due date keeps its distance from the bill date (credit days).
    prisma.$executeRaw`UPDATE "Invoice" SET "dueDate" = "dueDate" + (${mapped("issuedDate")} - "issuedDate"), ${set(["issuedDate", "createdAt", "updatedAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "WarrantyCaseLine" SET ${set(["createdAt", "updatedAt"])} WHERE "caseId" IN (${caseIds})`,
    prisma.$executeRaw`UPDATE "WarrantyCaseStatusHistory" SET ${set(["createdAt"])} WHERE "caseId" IN (${caseIds})`,
    prisma.$executeRaw`UPDATE "WarrantyCase" SET ${set(["createdAt", "updatedAt", "submittedAt", "decisionAt", "manufacturerClaimDate"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "JobCardCampaign" SET ${set(["createdAt"])} WHERE "jobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "CampaignVehicle" SET ${set(["scheduledAt", "completedAt"])} WHERE "completedJobCardId" = ${jobCardId}`,
    prisma.$executeRaw`UPDATE "JobCard" SET ${set(["createdAt", "updatedAt", "readyAt", "deliveredAt", "billedAt", "warrantyAcknowledgedAt"])} WHERE id = ${jobCardId}`,
  ]);

  // Promised delivery: after the work for delivered jobs; still ahead for open ones.
  const card = await prisma.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, select: { createdAt: true, deliveredAt: true } });
  const promised = card.deliveredAt
    ? new Date(card.deliveredAt.getTime() + 2 * HOUR_MS)
    : new Date(Math.max(card.createdAt.getTime() + promiseHours * HOUR_MS, realEnd.getTime() + DAY_MS));
  await prisma.$executeRaw`UPDATE "JobCard" SET "promisedAt" = ${utc(promised)}::timestamp WHERE id = ${jobCardId}`;
}
