/**
 * One-off data fix: notifications created before the enquiry routes existed
 * store `/appointments?tab=enquiries`, which no longer resolves.
 *
 * For each affected row we try to find the exact enquiry it refers to
 * (same branch, submitter name parsed from the message, created just before
 * the notification) and deep-link to `/enquiries/{id}`. If no confident
 * match is found, the row falls back to `/enquiries`.
 *
 * Run: npm run prisma:fix:notification-links
 */
import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STALE_LINK = "/appointments?tab=enquiries";
// createEnquiry notifies immediately after creating the row, so a tight
// window is safe and avoids false matches from repeat submitters.
const WINDOW_MS = 10 * 60 * 1000;

async function resolveEnquiryLink(
  messageId: string,
  message: string,
  branchId: string | null,
  notifiedAt: Date,
): Promise<string> {
  if (!branchId) return "/enquiries";

  const match = /^(.+?) submitted a service enquiry at /.exec(message);
  if (!match) return "/enquiries";
  const fullName = match[1].trim().toLowerCase();

  const candidates = await prisma.enquiry.findMany({
    where: {
      branchId,
      createdAt: {
        gte: new Date(notifiedAt.getTime() - WINDOW_MS),
        lte: notifiedAt,
      },
    },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const hit = candidates.find(
    (e) => `${e.firstName} ${e.lastName}`.trim().toLowerCase() === fullName,
  );

  if (!hit) {
    console.warn(`⚠️  No enquiry matched for notification ${messageId}; linking to /enquiries`);
    return "/enquiries";
  }
  return `/enquiries/${hit.id}`;
}

async function main() {
  const stale = await prisma.notification.findMany({
    where: { link: STALE_LINK },
    select: { id: true, message: true, branchId: true, createdAt: true },
  });

  console.log(`Found ${stale.length} notification(s) with stale link "${STALE_LINK}"`);

  let deepLinked = 0;
  let queued = 0;

  for (const n of stale) {
    const link = await resolveEnquiryLink(n.id, n.message, n.branchId, n.createdAt);
    await prisma.notification.update({ where: { id: n.id }, data: { link } });
    if (link === "/enquiries") queued++;
    else deepLinked++;
  }

  console.log(`✅ Done. Deep-linked to /enquiries/{id}: ${deepLinked}, sent to queue: ${queued}`);
}

main()
  .catch((error) => {
    console.error("❌ Failed to update notification links:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
