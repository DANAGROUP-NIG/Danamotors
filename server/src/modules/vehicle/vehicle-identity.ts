import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';
import { BadRequestError, ForbiddenError } from '../../shared/errors/appError';
import { PERMISSIONS, ROLES } from '../../shared/constants/roles';

/**
 * Vehicle identity: the fields that say which vehicle this is. Legacy protected every vehicle-master edit with
 * one shared password (SettingMaster.VehicleUpdatePassword), which recorded nobody. Here changing any of them
 * needs `vehicle:identity:update` and a reason. The before and after values are in the change log (Vehicle
 * trigger); the reason is a VEHICLE_IDENTITY_UPDATED audit event that carries the database transaction id, so
 * the identity history pairs each reason with its change exactly.
 */
export const IDENTITY_FIELDS = [
  'vin',
  'registrationNumber',
  'engineNumber',
  'saleDate',
  'year',
  'catalogueId',
  'modelId',
  'generationId',
  'engineId',
  'customMake',
  'customModel',
  'vehicleModelId',
] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** Fields shown in the identity history: the identity fields and the make and model they resolve to. */
const HISTORY_FIELDS = new Set<string>([...IDENTITY_FIELDS, 'make', 'model', 'trim']);

const DATE_FIELDS = new Set<string>(['saleDate']);

function normalise(field: string, value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  if (DATE_FIELDS.has(field)) {
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return value;
  return String(value).trim().toUpperCase() || null;
}

export type IdentityChanges = Partial<Record<IdentityField, { from: string | number | null; to: string | number | null }>>;

/** The identity fields the update would actually change. Fields left out, or sent unchanged, are ignored. */
export function identityChanges(current: Record<string, unknown>, data: Record<string, unknown>): IdentityChanges {
  const changes: IdentityChanges = {};
  for (const field of IDENTITY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, field) || data[field] === undefined) continue;
    const from = normalise(field, current[field]);
    const to = normalise(field, data[field]);
    if (from !== to) changes[field] = { from, to };
  }
  return changes;
}

type Actor = { userId: string; role: string; permissions?: string[] };

/** Refuses an identity change without the permission or a reason. */
export function assertCanChangeIdentity(actor: Actor, changes: IdentityChanges, reason: string | undefined) {
  const fields = Object.keys(changes);
  if (!fields.length) return;
  const allowed = actor.role === ROLES.SUPER_ADMIN || (actor.permissions ?? []).includes(PERMISSIONS.VEHICLE_IDENTITY_UPDATE);
  if (!allowed)
    throw new ForbiddenError(`Changing ${fields.join(', ')} needs the vehicle identity permission`);
  if (!reason || reason.trim().length < 5)
    throw new BadRequestError(`Give a reason (at least 5 characters) for changing ${fields.join(', ')}`);
}

/** Records the reason, in the same transaction as the change. */
export async function recordIdentityChange(
  tx: Prisma.TransactionClient,
  input: { actorId: string; vehicle: { id: string; vin: string; registrationNumber: string | null }; changes: IdentityChanges; reason: string },
) {
  const [{ tx: txId }] = await tx.$queryRaw<{ tx: string }[]>`SELECT txid_current()::text AS tx`;
  await tx.auditLog.create({
    data: {
      userId: input.actorId,
      action: 'VEHICLE_IDENTITY_UPDATED',
      details: JSON.stringify({
        vehicleId: input.vehicle.id,
        vin: input.vehicle.vin,
        registrationNumber: input.vehicle.registrationNumber,
        changes: input.changes,
        reason: input.reason.trim(),
        txId,
      }),
    },
  });
}

/**
 * Every change to the vehicle's identity, oldest first: from the change log (so changes made before this
 * check existed, through the warranty screen, or outside the app are included), with the reason where one
 * was given. Readable with vehicle:read: unlike the audit log, it shows only this vehicle's identity.
 */
export async function identityHistory(vehicleId: string) {
  const rows = await prisma.changeLog.findMany({
    where: { entity: 'Vehicle', recordId: vehicleId },
    orderBy: { id: 'asc' },
    select: { id: true, at: true, action: true, changes: true, userId: true, source: true, txId: true },
  });
  type Change = { field: string; old?: unknown; new?: unknown };
  const relevant = rows
    .map((row) => ({ ...row, changes: (row.changes as Change[]).filter((c) => HISTORY_FIELDS.has(c.field)) }))
    .filter((row) => row.changes.length > 0);
  if (!relevant.length) return [];

  const [users, events] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(relevant.map((r) => r.userId).filter((id): id is string => !!id))] } },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.auditLog.findMany({
      where: { action: 'VEHICLE_IDENTITY_UPDATED', details: { contains: `"vehicleId":"${vehicleId}"` } },
      select: { details: true },
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  const reasons = new Map<string, string>();
  for (const event of events) {
    const details = JSON.parse(event.details ?? '{}') as { txId?: string; reason?: string };
    if (details.txId && details.reason) reasons.set(details.txId, details.reason);
  }
  return relevant.map((row) => ({
    id: row.id.toString(),
    at: row.at,
    action: row.action,
    by: row.userId ? (names.get(row.userId) ?? 'Unknown user') : row.source === 'DB' ? 'Outside the app' : 'System',
    changes: row.changes.map((c) => ({ field: c.field, old: c.old ?? null, new: c.new ?? null })),
    reason: reasons.get(row.txId.toString()) ?? null,
  }));
}
