import { Customer, Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../prisma/client';

/**
 * Customer merge additions (gap analysis §5), replacing legacy's Customer Correction Utility:
 * - choose, per group of fields, whether the survivor keeps its own details or takes the duplicate's;
 * - a merge history on the surviving customer, from the CUSTOMER_MERGE audit events;
 * - duplicate groups by phone, name or company, and merging many pairs in one go (no XLS).
 */

/** The fields that move together when the user picks which record's details survive. */
export const MERGE_FIELD_GROUPS = {
  name: ['type', 'salutation', 'firstName', 'lastName', 'companyName', 'registeredName', 'contactPerson'],
  phone: ['phoneNumber', 'mobile2', 'office1', 'office2', 'residencePhone', 'stdCode', 'fax'],
  email: ['email'],
  address: ['address', 'house', 'street', 'zone', 'city', 'district', 'state', 'postalCode', 'country'],
} as const satisfies Record<string, readonly (keyof Customer)[]>;
export type MergeFieldGroup = keyof typeof MERGE_FIELD_GROUPS;

/** For each group: TARGET keeps the survivor's own details (the default), SOURCE takes the duplicate's. */
export const mergeKeepSchema = z.object({
  name: z.enum(['TARGET', 'SOURCE']).optional(),
  phone: z.enum(['TARGET', 'SOURCE']).optional(),
  email: z.enum(['TARGET', 'SOURCE']).optional(),
  address: z.enum(['TARGET', 'SOURCE']).optional(),
}).strict();
export type MergeKeep = z.infer<typeof mergeKeepSchema>;

/** The survivor's new values for the groups taken from the duplicate. */
export function keptFields(source: Customer, keep: MergeKeep): Partial<Customer> {
  const data: Record<string, unknown> = {};
  for (const [group, choice] of Object.entries(keep) as [MergeFieldGroup, 'TARGET' | 'SOURCE' | undefined][]) {
    if (choice !== 'SOURCE') continue;
    for (const field of MERGE_FIELD_GROUPS[group]) data[field] = source[field];
  }
  return data as Partial<Customer>;
}

const displayName = (c: Pick<Customer, 'companyName' | 'firstName' | 'lastName'>) =>
  c.companyName?.trim() || [c.firstName, c.lastName].filter(Boolean).join(' ').trim();

/** What the merge history shows of each record as it was before the merge. */
export function mergeSnapshot(c: Customer) {
  return {
    id: c.id,
    code: c.code,
    name: displayName(c),
    phone: [c.phoneNumber, c.mobile2].filter(Boolean).join(', ') || null,
    email: c.email,
    address: [c.house, c.street, c.address, c.zone, c.city, c.state].filter(Boolean).join(', ') || null,
    branchId: c.branchId,
  };
}

type MergeEventDetails = {
  sourceId: string;
  targetId: string;
  moved?: Record<string, number>;
  kept?: MergeKeep;
  before?: { source: ReturnType<typeof mergeSnapshot>; target: ReturnType<typeof mergeSnapshot> };
  joinedOrganizationId?: string;
  droppedOrganizationId?: string;
};

/**
 * Merges into this customer, newest first, including merges into customers that were themselves merged into
 * it later. Events from before 5 Nov 2026 have no "before" details; the duplicate is then shown as it is now.
 */
export async function mergeHistory(customerId: string) {
  const absorbed = await prisma.customer.findMany({ where: { mergedIntoId: customerId }, select: { id: true } });
  const targets = [customerId, ...absorbed.map((c) => c.id)];
  const events = await prisma.auditLog.findMany({
    where: { action: 'CUSTOMER_MERGE', OR: targets.map((id) => ({ details: { contains: `"targetId":"${id}"` } })) },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const parsed = events.map((e) => ({ event: e, details: JSON.parse(e.details ?? '{}') as MergeEventDetails }));
  const missing = parsed.filter((p) => !p.details.before).map((p) => p.details.sourceId);
  const current = missing.length
    ? await prisma.customer.findMany({ where: { id: { in: missing } } })
    : [];
  const now = new Map(current.map((c) => [c.id, mergeSnapshot(c)]));
  return parsed.map(({ event, details }) => ({
    id: event.id,
    at: event.createdAt,
    by: event.user ? `${event.user.firstName} ${event.user.lastName}`.trim() : 'System',
    duplicate: details.before?.source ?? now.get(details.sourceId) ?? { id: details.sourceId, code: null, name: 'Unknown customer' },
    survivorBefore: details.before?.target ?? null,
    intoEarlierRecord: details.targetId !== customerId,
    moved: Object.fromEntries(Object.entries(details.moved ?? {}).filter(([, n]) => n > 0)),
    kept: details.kept ?? {},
  }));
}

export const duplicateGroupsQuery = z.object({
  by: z.enum(['phone', 'name', 'company']).default('phone'),
  branchId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/** The grouping key per kind: the last 10 digits of the phone, the name, or the company, normalised. */
const KEY_SQL = {
  phone: Prisma.sql`NULLIF(right(regexp_replace(COALESCE(c."phoneNumber", ''), '\\D', '', 'g'), 10), '')`,
  name: Prisma.sql`NULLIF(lower(regexp_replace(trim(c."firstName" || ' ' || c."lastName"), '\\s+', ' ', 'g')), '')`,
  company: Prisma.sql`NULLIF(lower(regexp_replace(trim(COALESCE(c."companyName", '')), '\\s+', ' ', 'g')), '')`,
};

/**
 * Likely duplicates: active (not merged) customers sharing a phone, name or company, largest groups first,
 * with what each holds so the user can pick the survivor. Phones need at least 7 digits.
 */
export async function duplicateGroups(query: z.infer<typeof duplicateGroupsQuery>) {
  const key = KEY_SQL[query.by];
  const branch = query.branchId ? Prisma.sql`AND c."branchId" = ${query.branchId}` : Prisma.empty;
  const minLength = query.by === 'phone' ? 7 : 2;
  const grouped = Prisma.sql`
    SELECT ${key} AS key, count(*) AS size FROM "Customer" c
    WHERE c."mergedIntoId" IS NULL ${branch}
    GROUP BY 1 HAVING ${key} IS NOT NULL AND length(${key}) >= ${minLength} AND count(*) > 1`;
  const [[{ total }], groups] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM (${grouped}) g`,
    prisma.$queryRaw<{ key: string; size: bigint }[]>`${grouped} ORDER BY 2 DESC, 1 LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
  ]);
  const keys = groups.map((g) => g.key);
  const members = keys.length
    ? await prisma.$queryRaw<{
        key: string; id: string; code: string | null; type: string; name: string; phone: string | null; email: string | null;
        branch: string | null; createdAt: Date; vehicles: bigint; jobCards: bigint; invoices: bigint;
      }[]>`
      SELECT ${key} AS key, c.id, c.code, c.type,
             COALESCE(NULLIF(trim(c."companyName"), ''), trim(c."firstName" || ' ' || c."lastName")) AS name,
             c."phoneNumber" AS phone, c.email, b.name AS branch, c."createdAt",
             (SELECT count(*) FROM "Vehicle" v WHERE v."customerId" = c.id) AS vehicles,
             (SELECT count(*) FROM "JobCard" j WHERE j."customerId" = c.id) AS "jobCards",
             (SELECT count(*) FROM "Invoice" i WHERE i."customerId" = c.id) AS invoices
      FROM "Customer" c LEFT JOIN "Branch" b ON b.id = c."branchId"
      WHERE c."mergedIntoId" IS NULL ${branch} AND ${key} IN (${Prisma.join(keys)})
      ORDER BY c."createdAt"`
    : [];
  const count = Number(total);
  return {
    groups: groups.map((g) => ({
      key: g.key,
      size: Number(g.size),
      members: members
        .filter((m) => m.key === g.key)
        .map(({ key: _key, vehicles, jobCards, invoices, ...m }) => ({ ...m, vehicles: Number(vehicles), jobCards: Number(jobCards), invoices: Number(invoices) })),
    })),
    meta: { total: count, page: query.page, limit: query.limit, totalPages: Math.ceil(count / query.limit) },
  };
}

export const mergeBatchSchema = z.object({
  merges: z.array(z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid(), keep: mergeKeepSchema.optional() }).strict()).min(1).max(100),
}).strict();
