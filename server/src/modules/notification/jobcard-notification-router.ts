import { Prisma, type JobcardNotificationEvent } from "@prisma/client";
import { z } from "zod";
import prisma from "../../prisma/client";
import {
  DURABLE_WORKSHOP_EVENTS,
  deliverWorkshopNotification,
} from "./workshop-notification-outbox";
import { ROLES } from "../../shared/constants/roles";
import {
  canonicalNotificationStatus,
  isWorkingTime,
  notificationEvents,
  notificationPolicy,
  reminderEvents,
  routeJobNotification,
  promisedReminderEvents,
  notificationStatusLabel,
  notificationDueLabel,
  notificationInstant,
  type JobNotificationEvent,
  type NotificationJob,
  type RecipientTarget,
} from "./jobcard-notification-policy";

const jobSnapshot = z.object({
  id: z.string(),
  branchId: z.string(),
  jobNumber: z.string(),
  status: z.string(),
  technicianId: z.string().nullable(),
  qualityInspectorId: z.string().nullable(),
  serviceAdvisorId: z.string().nullable(),
  deliveryAdvisorId: z.string().nullable(),
  createdById: z.string().nullable(),
  customerId: z.string().nullable(),
  qcStatus: z.string().nullable(),
  qcNotes: z.string().nullable(),
  promisedAt: z
    .string()
    .nullable()
    .transform((value, context) => {
      if (value === null) return null;
      const date = notificationInstant(value);
      if (!Number.isFinite(date.getTime())) {
        context.addIssue({
          code: "custom",
          message: "Invalid promised date in notification snapshot",
        });
        return z.NEVER;
      }
      return date.toISOString();
    }),
});

function warning(message: string) {
  process.emitWarning(message, { code: "JOBCARD_NOTIFICATION_WARNING" });
}

// Assignment/QC do not have a status-history actor. Set transaction-local context;
// no global connection/session state survives commit or rollback.
export async function setNotificationActor(
  tx: Prisma.TransactionClient,
  actorId?: string,
) {
  if (actorId)
    await tx.$queryRaw(
      Prisma.sql`SELECT set_config('app.notification_actor', ${actorId}, true)`,
    );
}

interface Delivery {
  recipientId: string;
  userId?: string;
  customerId?: string;
  intents: Set<string>;
  fyi: boolean;
}

async function resolveTargets(
  tx: Prisma.TransactionClient,
  card: NotificationJob,
  actorId: string | null,
  targets: RecipientTarget[],
) {
  const deliveries = new Map<string, Delivery>();
  const add = (
    recipientId: string,
    target: RecipientTarget,
    customer = false,
  ) => {
    if (!customer && recipientId === actorId) return;
    const key = `${customer ? "customer" : "user"}:${recipientId}`;
    const existing = deliveries.get(key);
    if (existing) {
      existing.intents.add(target.intent);
      existing.fyi = existing.fyi && !!target.fyi;
    } else
      deliveries.set(key, {
        recipientId: key,
        ...(customer ? { customerId: recipientId } : { userId: recipientId }),
        intents: new Set([target.intent]),
        fyi: !!target.fyi,
      });
  };
  for (const target of targets) {
    if (target.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: target.customerId },
        select: { account: { select: { isActive: true } } },
      });
      // Customers without portal accounts cannot receive in-app notifications.
      if (customer?.account?.isActive) add(target.customerId, target, true);
      continue;
    }
    const users = await tx.user.findMany({
      where: {
        isActive: true,
        branchId: card.branchId,
        ...(target.userId
          ? { id: target.userId }
          : target.permission
            ? {
                role: {
                  permissions: {
                    some: { permission: { name: target.permission } },
                  },
                },
              }
            : { role: { name: target.role } }),
        ...(target.assignedTechnicianOnly
          ? { role: { name: ROLES.TECHNICIAN } }
          : {}),
      },
      select: { id: true },
    });
    if (users.length) {
      users.forEach((user) => add(user.id, target));
      continue;
    }
    if (target.assignedTechnicianOnly) continue;
    warning(
      `Jobcard ${card.id}: no active recipient for ${target.role ?? target.permission ?? target.userId}; falling back to Admin`,
    );
    const admins = await activeAdmins(tx, card.branchId);
    const eligible = admins.filter((user) => user.id !== actorId);
    if (!eligible.length)
      throw new Error("No active non-actor Admin available for fallback");
    eligible.forEach((user) =>
      add(user.id, { ...target, intent: `Fallback: ${target.intent}` }),
    );
  }
  return [...deliveries.values()];
}

async function activeAdmins(tx: Prisma.TransactionClient, branchId?: string) {
  const role = { name: { in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] } };
  if (branchId) {
    const local = await tx.user.findMany({
      where: { isActive: true, branchId, role },
      select: { id: true },
    });
    if (local.length) return local;
  }
  return tx.user.findMany({
    where: { isActive: true, role },
    select: { id: true },
  });
}

export function notificationDedupeKey(
  jobCardId: string,
  event: string,
  eventId: string,
  recipientId: string,
) {
  return `jobcard:${jobCardId}:${event}:${eventId}:${recipientId}`;
}

async function deliver(
  tx: Prisma.TransactionClient,
  row: JobcardNotificationEvent,
  event: JobNotificationEvent,
  before: NotificationJob | null,
  card: NotificationJob,
  now: Date,
) {
  let targets = routeJobNotification(event, before, card);
  if (!targets.length) return;
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${card.id} FOR SHARE`,
  );
  const isQcReview = event === "QC_PASSED" || event === "QC_FAILED";
  const live = await tx.jobCard.findUnique({
    where: { id: card.id },
    include: {
      vehicle: true,
      customer: !isQcReview,
      serviceWorkflow: { select: { jobCardId: true } },
    },
  });
  if (!live) throw new Error("Jobcard missing during notification routing");
  const toStatus = canonicalNotificationStatus(card.status);
  const adviser: RecipientTarget = card.serviceAdvisorId
    ? { userId: card.serviceAdvisorId, intent: "Review the job card" }
    : { role: ROLES.SERVICE_ADVISOR, intent: "Review the job card" };
  let tab = "";
  if (live.serviceWorkflow) {
    if (event === "ASSIGNED" && card.technicianId) {
      targets = [
        {
          userId: card.technicianId,
          assignedTechnicianOnly: true,
          intent: "Review your Technician assignment",
        },
      ];
      tab = "?tab=labour";
    } else if (event === "STATUS" && toStatus === "QC") {
      targets = [
        { role: ROLES.QC_OFFICER, intent: "Inspect completed work" },
        { ...adviser, intent: "Job is awaiting quality check" },
      ];
      tab = "?tab=qc";
    } else if (event === "QC_PASSED") {
      targets = [{ ...adviser, intent: "Mark the job ready for billing" }];
      tab = "?tab=qc";
    } else if (event === "QC_FAILED") {
      tab = "?tab=qc";
    } else if (event === "STATUS" && toStatus === "READY") {
      targets = [
        { role: ROLES.BILLING_OFFICER, intent: "Prepare the job bill" },
      ];
      tab = "?tab=billing";
    }
  }
  if (event.startsWith("PROMISED_")) {
    const liveCard = jobSnapshot.parse({
      ...live,
      promisedAt:
        live.promisedAt instanceof Date
          ? live.promisedAt.toISOString()
          : live.promisedAt,
    });
    const currentWindow = promisedReminderEvents(now, liveCard);
    if (
      liveCard.promisedAt !== card.promisedAt ||
      !currentWindow.includes(event)
    ) {
      await tx.jobcardNotificationAudit.createMany({
        data: [
          {
            jobCardId: card.id,
            eventId: row.id,
            eventType: event,
            recipientId: "obsolete-promised-date",
            status: "SUPPRESSED_STALE_ACTION",
            createdAt: new Date(),
          },
        ],
        skipDuplicates: true,
      });
      return;
    }
    card = liveCard;
    targets = routeJobNotification(event, before, card);
  }
  const stale =
    canonicalNotificationStatus(live.status) !==
      canonicalNotificationStatus(card.status) ||
    live.technicianId !== card.technicianId ||
    live.qcStatus?.toUpperCase() !== card.qcStatus?.toUpperCase() ||
    live.qualityInspectorId !== card.qualityInspectorId ||
    live.serviceAdvisorId !== card.serviceAdvisorId ||
    live.deliveryAdvisorId !== card.deliveryAdvisorId;
  if (live.branchId !== card.branchId || (stale && !isQcReview)) {
    await tx.jobcardNotificationAudit.createMany({
      data: [
        {
          jobCardId: card.id,
          eventId: row.id,
          eventType: event,
          recipientId: "obsolete-action",
          status: "SUPPRESSED_STALE_ACTION",
          createdAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    targets =
      live.branchId === card.branchId
        ? targets.filter((target) => target.fyi)
        : [];
    if (!targets.length) return;
  }
  const actor =
    !isQcReview && row.actorId
      ? await tx.user.findUnique({
          where: { id: row.actorId },
          select: { firstName: true, lastName: true },
        })
      : null;
  const deliveries = await resolveTargets(tx, card, row.actorId, targets);
  if (!deliveries.length) {
    // This is expected when every resolved recipient is the acting user, or the
    // only informational customer has no portal account. Keep an audit marker.
    await tx.jobcardNotificationAudit.createMany({
      data: [
        {
          jobCardId: card.id,
          eventId: row.id,
          eventType: event,
          recipientId: row.actorId ? `actor:${row.actorId}` : "none",
          status: "SUPPRESSED_NO_ELIGIBLE_RECIPIENT",
          createdAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    return;
  }
  const customer = live.customer
    ? `${live.customer.firstName} ${live.customer.lastName}`
    : "Customer not recorded";
  const vehicle = live.vehicle?.registrationNumber ?? "Vehicle not recorded";
  const actorName = actor ? `${actor.firstName} ${actor.lastName}` : "System";
  const from = before ? canonicalNotificationStatus(before.status) : "NONE";
  const to = canonicalNotificationStatus(card.status);
  // TODO(confirm): JobCard has no priority field; never invent a priority.
  const context = isQcReview
    ? `Job card ${card.jobNumber}, ${vehicle}, ${event === "QC_PASSED" ? "QC passed" : "QC failed"}${live.serviceWorkflow && event === "QC_FAILED" && card.qcNotes ? `. ${card.qcNotes}` : ""}`
    : `Jobcard ${card.jobNumber}; ${vehicle}; ${customer}; ${notificationStatusLabel(from)} to ${notificationStatusLabel(to)}; updated by ${actorName}; due ${notificationDueLabel(card.promisedAt)}; priority not recorded`;
  const data = deliveries.map((delivery) => ({
    ...(delivery.userId
      ? { userId: delivery.userId }
      : { customerId: delivery.customerId }),
    branchId: card.branchId,
    type: `JOBCARD_${event}`,
    title: `${delivery.fyi ? "FYI: " : ""}${[...delivery.intents].join("; ")}`,
    message: `${context}; ${delivery.fyi ? "FYI" : "Action required"}: ${[...delivery.intents].join("; ")}`,
    link: delivery.customerId
      ? `/portal/service-history/${card.id}`
      : `/job-cards/${card.id}${tab}`,
    dedupeKey: notificationDedupeKey(
      card.id,
      event,
      row.id,
      delivery.recipientId,
    ),
  }));
  await tx.notification.createMany({ data, skipDuplicates: true });
  await tx.jobcardNotificationAudit.createMany({
    data: deliveries.map((delivery) => ({
      jobCardId: card.id,
      eventId: row.id,
      eventType: event,
      recipientId: delivery.recipientId,
      channel: "in-app",
      status: "DELIVERED",
      createdAt: new Date(),
    })),
    skipDuplicates: true,
  });
}

async function recordFailure(row: JobcardNotificationEvent, attempts: number) {
  warning(
    `Jobcard ${row.jobCardId}: notification event ${row.id} failed after ${attempts} attempts`,
  );
  // Store a bounded technical reason, never driver errors/SQL parameters.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM jobcard_notification_events WHERE id = ${row.id} FOR UPDATE`,
    );
    const current = await tx.jobcardNotificationEvent.findUnique({
      where: { id: row.id },
    });
    if (!current || current.processedAt) return;
    await tx.notificationFailure.upsert({
      where: { eventId: row.id },
      create: {
        jobCardId: row.jobCardId,
        eventId: row.id,
        reason:
          "Notification routing or persistence failed; inspect server warning and event snapshot",
        attempts,
        createdAt: new Date(),
      },
      update: { attempts },
    });
    const snapshot = jobSnapshot
      .extend({ vehicleId: z.string().nullable().optional() })
      .safeParse(row.after);
    const card = snapshot.success ? snapshot.data : null;
    const admins = (await activeAdmins(tx, card?.branchId)).filter(
      (admin) => admin.id !== row.actorId,
    );
    if (!admins.length)
      throw new Error("No active Admin for notification failure alert");
    const previous = row.before ? jobSnapshot.safeParse(row.before) : null;
    const context = `Jobcard ${card?.jobNumber ?? "Not provided"}; ${notificationStatusLabel(previous?.success ? previous.data.status : "NONE")} to ${notificationStatusLabel(card?.status ?? "UNKNOWN")}; due ${notificationDueLabel(card?.promisedAt ?? null)}`;
    await tx.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        branchId: card?.branchId,
        type: "JOBCARD_NOTIFICATION_FAILURE",
        title: "Jobcard notification failed",
        message: `${context}; Action required: review delivery failures and replay event ${row.id}, which failed after ${attempts} attempts.`,
        link: `/job-cards/${row.jobCardId}`,
        dedupeKey: notificationDedupeKey(
          row.jobCardId,
          "FAILURE",
          row.id,
          admin.id,
        ),
      })),
      skipDuplicates: true,
    });
    await tx.jobcardNotificationAudit.createMany({
      data: admins.map((admin) => ({
        jobCardId: row.jobCardId,
        eventId: row.id,
        eventType: "FAILURE_ALERT",
        recipientId: `user:${admin.id}`,
        status: "DELIVERED",
        createdAt: new Date(),
      })),
      skipDuplicates: true,
    });
    await tx.jobcardNotificationAudit.createMany({
      data: [
        {
          jobCardId: row.jobCardId,
          eventId: row.id,
          eventType: "ROUTING",
          recipientId: "unresolved",
          status: "FAILED",
          createdAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });
    await tx.jobcardNotificationEvent.update({
      where: { id: row.id },
      data: { processedAt: new Date() },
    });
  });
}

export async function processJobcardNotification(
  row: JobcardNotificationEvent,
  now = new Date(),
) {
  const policy = notificationPolicy();
  for (let attempt = 0; attempt <= policy.retryMs.length; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Producers lock the job before upserting an event. Use that order here too.
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "JobCard" WHERE id = ${row.jobCardId} FOR SHARE`,
          );
          // Serialize competing workers; deliveries/audit and processed marker commit together.
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM jobcard_notification_events WHERE id = ${row.id} FOR UPDATE`,
          );
          const current = await tx.jobcardNotificationEvent.findUnique({
            where: { id: row.id },
          });
          if (!current || current.processedAt) return;
          const card = jobSnapshot.parse(current.after);
          const before = current.before
            ? jobSnapshot.parse(current.before)
            : null;
          const metadata = z
            .object({
              notificationEvent: z.string().optional(),
              actionOccurrence: z.string().optional(),
              workshopEvent: z.enum(DURABLE_WORKSHOP_EVENTS).optional(),
              workshopOccurrence: z.string().optional(),
              branchStoreOnly: z.boolean().optional(),
              workshopDetail: z.string().optional(),
            })
            .parse(current.after);
          if (metadata.workshopEvent) {
            if (!metadata.workshopOccurrence)
              throw new Error("Parts event occurrence is missing");
            await deliverWorkshopNotification(
              tx,
              current,
              metadata.workshopEvent,
              card,
              metadata.workshopOccurrence,
              metadata.branchStoreOnly ?? false,
              now,
              metadata.workshopDetail,
            );
            await tx.jobcardNotificationEvent.update({
              where: { id: current.id },
              data: { processedAt: now },
            });
            return;
          }
          const timerEvents = [
            "REMINDER",
            "ESCALATION",
            "PROMISED_24H",
            "PROMISED_12H",
          ] as const;
          const timerEvent = timerEvents.find(
            (event) => event === metadata.notificationEvent,
          );
          if (
            timerEvent?.startsWith("PROMISED_") &&
            process.env.JOB_PROMISED_REMINDERS_ENABLED !== "true"
          )
            return;
          if (timerEvent && !isWorkingTime(now, policy)) return;
          if (
            timerEvent &&
            !timerEvent.startsWith("PROMISED_") &&
            metadata.actionOccurrence
          ) {
            const latest = await tx.jobcardNotificationEvent.findFirst({
              where: {
                jobCardId: card.id,
                NOT: [
                  { id: { startsWith: "timer:" } },
                  { id: { startsWith: "workshop:" } },
                ],
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            });
            if (latest && latest.id !== metadata.actionOccurrence) {
              await tx.jobcardNotificationAudit.createMany({
                data: [
                  {
                    jobCardId: card.id,
                    eventId: current.id,
                    eventType: timerEvent,
                    recipientId: "obsolete-action",
                    status: "SUPPRESSED_STALE_ACTION",
                    createdAt: now,
                  },
                ],
                skipDuplicates: true,
              });
              await tx.jobcardNotificationEvent.update({
                where: { id: current.id },
                data: { processedAt: now },
              });
              return;
            }
          }
          const events = timerEvent
            ? [timerEvent]
            : notificationEvents(before, card);
          for (const event of events)
            await deliver(tx, current, event, before, card, now);
          await tx.jobcardNotificationEvent.update({
            where: { id: row.id },
            data: { processedAt: new Date() },
          });
        },
        { maxWait: 5000, timeout: 15000 },
      );
      return;
    } catch {
      if (attempt < policy.retryMs.length)
        await new Promise((resolve) =>
          setTimeout(resolve, policy.retryMs[attempt]),
        );
    }
  }
  try {
    await recordFailure(row, policy.retryMs.length + 1);
  } catch {
    // A database outage cannot persist its own failure. Leave the outbox pending
    // for the next sweep and emit an observable warning rather than dropping it.
    warning(
      `Jobcard ${row.jobCardId}: failure recording/Admin alert unavailable; event ${row.id} remains pending`,
    );
  }
}

export async function drainJobcardNotifications(
  jobCardId?: string,
  now?: Date,
) {
  try {
    const at = now ?? new Date();
    const filters: Prisma.JobcardNotificationEventWhereInput[] = [];
    if (!isWorkingTime(at, notificationPolicy()))
      filters.push({ NOT: { id: { startsWith: "timer:" } } });
    if (process.env.JOB_PROMISED_REMINDERS_ENABLED !== "true")
      filters.push({
        NOT: {
          OR: [
            { id: { contains: ":PROMISED_24H:" } },
            { id: { contains: ":PROMISED_12H:" } },
          ],
        },
      });
    const rows = await prisma.jobcardNotificationEvent.findMany({
      where: {
        processedAt: null,
        AND: filters,
        ...(jobCardId ? { jobCardId } : {}),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
    });
    for (const row of rows) await processJobcardNotification(row, now);
  } catch {
    warning(
      "Jobcard notification outbox unavailable; pending events will be retried",
    );
  }
}

export async function sendJobcardReminders(now = new Date()) {
  const policy = notificationPolicy();
  // TODO(confirm): retain the existing working-hour policy for promised reminders.
  if (!isWorkingTime(now, policy)) return;
  let cursor: string | undefined;
  while (true) {
    const cards = await prisma.jobCard.findMany({
      where: {
        status: { notIn: ["DELIVERED", "CANCELLED", "Closed", "Cancelled"] },
      },
      include: { statusHistory: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!cards.length) return;
    const latestRows = await prisma.$queryRaw<
      {
        jobCardId: string;
        id: string;
        createdAt: Date;
        after: Prisma.JsonValue;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT ON ("jobCardId") "jobCardId", id, "createdAt", "after"
      FROM jobcard_notification_events
      WHERE "jobCardId" IN (${Prisma.join(cards.map((card) => card.id))})
        AND id NOT LIKE 'timer:%' AND id NOT LIKE 'workshop:%'
      ORDER BY "jobCardId", "createdAt" DESC, id DESC
    `);
    const latest = new Map(latestRows.map((row) => [row.jobCardId, row]));
    const pending: Prisma.JobcardNotificationEventCreateManyInput[] = [];
    for (const live of cards) {
      const card = jobSnapshot.parse({
        ...live,
        promisedAt: live.promisedAt?.toISOString() ?? null,
      });
      const action = latest.get(card.id);
      const actionCard = action ? jobSnapshot.parse(action.after) : card;
      const since =
        action?.createdAt ?? live.statusHistory[0]?.createdAt ?? live.createdAt;
      const occurrence =
        action?.id ??
        `${canonicalNotificationStatus(card.status)}:${since.toISOString()}`;
      for (const event of reminderEvents(since, now, actionCard, policy)) {
        const id = `timer:${card.id}:${event}:${occurrence}`;
        pending.push({
          id,
          jobCardId: card.id,
          actorId: null,
          before: { ...actionCard },
          after: {
            ...actionCard,
            notificationEvent: event,
            actionOccurrence: occurrence,
          },
          createdAt: now,
        });
      }
      if (process.env.JOB_PROMISED_REMINDERS_ENABLED === "true")
        for (const event of promisedReminderEvents(now, card)) {
          const id = `timer:${card.id}:${event}:${card.promisedAt}`;
          pending.push({
            id,
            jobCardId: card.id,
            actorId: null,
            before: { ...card },
            after: { ...card, notificationEvent: event },
            createdAt: now,
          });
        }
    }
    if (pending.length)
      await prisma.jobcardNotificationEvent.createMany({
        data: pending,
        skipDuplicates: true,
      });
    if (cards.length < 100) return;
    cursor = cards[cards.length - 1].id;
  }
}
export function startJobcardNotifications() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await drainJobcardNotifications();
      await sendJobcardReminders();
      await drainJobcardNotifications();
    } catch {
      warning("Jobcard notification sweep failed; will retry");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => {
    void tick();
  }, notificationPolicy().pollMs);
  timer.unref();
  return () => clearInterval(timer);
}

// Explicit replay is a dev/operations action; preserve the original event ID so
// deliveries already persisted cannot be duplicated.
export async function replayJobcardNotification(eventId: string) {
  await prisma.jobcardNotificationEvent.update({
    where: { id: eventId },
    data: { processedAt: null },
  });
  const row = await prisma.jobcardNotificationEvent.findUniqueOrThrow({
    where: { id: eventId },
  });
  await processJobcardNotification(row);
}
