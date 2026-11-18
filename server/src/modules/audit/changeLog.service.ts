import { Prisma } from '@prisma/client';
import prisma from '../../prisma/client';

/**
 * Field-level change log (ChangeLog, filled by Postgres triggers: migration 20261105130000_change_log).
 * Read-only here. Legacy equivalent: User Activity Report / Summary.
 */

export type ChangeLogGroup = 'MASTER' | 'TRANSACTION';

/** Tables with a change-log trigger. Add a table here when you add its trigger. */
export const CHANGE_LOG_ENTITIES: Record<string, { label: string; group: ChangeLogGroup }> = {
  User: { label: 'User', group: 'MASTER' },
  Role: { label: 'Role and permissions', group: 'MASTER' },
  Customer: { label: 'Customer', group: 'MASTER' },
  Vehicle: { label: 'Vehicle', group: 'MASTER' },
  SparePart: { label: 'Part', group: 'MASTER' },
  LabourItem: { label: 'Labour', group: 'MASTER' },
  LabourRate: { label: 'Model labour rate', group: 'MASTER' },
  WorkshopMaster: { label: 'Workshop master', group: 'MASTER' },
  VehicleModel: { label: 'Vehicle model', group: 'MASTER' },
  Branch: { label: 'Branch', group: 'MASTER' },
  BranchSettings: { label: 'Branch settings', group: 'MASTER' },
  Employee: { label: 'Employee', group: 'MASTER' },
  FinanceSetting: { label: 'Finance setting', group: 'MASTER' },
  ReportSetting: { label: 'Report setting', group: 'MASTER' },
  DocumentTerms: { label: 'Document terms', group: 'MASTER' },
  MileageBand: { label: 'Mileage band', group: 'MASTER' },
  Bank: { label: 'Bank', group: 'MASTER' },
  PartCategory: { label: 'Part category', group: 'MASTER' },
  PartCategoryBranchSetting: { label: 'Part category branch setting', group: 'MASTER' },
  PartTaxCategory: { label: 'Part tax category', group: 'MASTER' },
  CorporateGroup: { label: 'Corporate group', group: 'MASTER' },
  TallyAccountMapping: { label: 'Tally account mapping', group: 'MASTER' },
  ServiceTypeModelSetting: { label: 'Service charge by model', group: 'MASTER' },
  Campaign: { label: 'Campaign', group: 'MASTER' },
  JobCard: { label: 'Job card', group: 'TRANSACTION' },
  Estimate: { label: 'Estimate', group: 'TRANSACTION' },
  Invoice: { label: 'Invoice', group: 'TRANSACTION' },
  Receipt: { label: 'Receipt', group: 'TRANSACTION' },
  PartyNote: { label: 'Debit/credit note', group: 'TRANSACTION' },
  CustomerOrder: { label: 'Customer part order (CPO)', group: 'TRANSACTION' },
  CounterSaleReturn: { label: 'Counter sale return', group: 'TRANSACTION' },
  BranchIndent: { label: 'Branch indent', group: 'TRANSACTION' },
  StockTransferNote: { label: 'Stock transfer note (STN)', group: 'TRANSACTION' },
  MaterialInTransit: { label: 'Material in transit (MIT)', group: 'TRANSACTION' },
  MaterialReceiptNote: { label: 'Material receipt (MRN)', group: 'TRANSACTION' },
  PartRequisition: { label: 'Part requisition', group: 'TRANSACTION' },
  PartReturnSlip: { label: 'Part return slip', group: 'TRANSACTION' },
  StockTake: { label: 'Stock take', group: 'TRANSACTION' },
  WarrantyCase: { label: 'Warranty case', group: 'TRANSACTION' },
};

export type ChangeLogFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  userId?: string;
  entity?: string;
  group?: ChangeLogGroup;
  action?: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Only changes made outside the app (legacy "Show Back End Updations Only"). */
  outsideAppOnly?: boolean;
  /** Record id (exact) or label (contains). */
  record?: string;
  /** Set for anyone but a SuperAdmin: only changes by users of this branch, never DB-source rows. */
  branchId?: string;
};

export function buildChangeLogWhere(filters: ChangeLogFilters, branchUserIds?: string[]): Prisma.ChangeLogWhereInput {
  const and: Prisma.ChangeLogWhereInput[] = [];
  if (filters.dateFrom || filters.dateTo) {
    and.push({ at: { ...(filters.dateFrom && { gte: filters.dateFrom }), ...(filters.dateTo && { lte: filters.dateTo }) } });
  }
  if (filters.userId) and.push({ userId: filters.userId });
  if (filters.entity) and.push({ entity: filters.entity });
  if (filters.group) {
    and.push({ entity: { in: Object.keys(CHANGE_LOG_ENTITIES).filter((e) => CHANGE_LOG_ENTITIES[e].group === filters.group) } });
  }
  if (filters.action) and.push({ action: filters.action });
  if (filters.outsideAppOnly) and.push({ source: 'DB' });
  if (filters.record) {
    const record = filters.record.trim();
    and.push({ OR: [{ recordId: record }, { recordLabel: { contains: record, mode: 'insensitive' } }] });
  }
  if (branchUserIds) and.push({ userId: { in: branchUserIds } });
  return and.length ? { AND: and } : {};
}

type UserName = { id: string; firstName: string; lastName: string; email: string };

async function usersById(ids: (string | null)[]): Promise<Map<string, UserName>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

async function branchUserIds(branchId?: string): Promise<string[] | undefined> {
  if (!branchId) return undefined;
  const users = await prisma.user.findMany({ where: { branchId }, select: { id: true } });
  return users.map((u) => u.id);
}

function toDto(row: Prisma.ChangeLogGetPayload<object>, users: Map<string, UserName>) {
  const meta = CHANGE_LOG_ENTITIES[row.entity];
  return {
    id: row.id.toString(),
    at: row.at,
    entity: row.entity,
    entityLabel: meta?.label ?? row.entity,
    group: meta?.group ?? null,
    recordId: row.recordId,
    recordLabel: row.recordLabel,
    action: row.action,
    changes: row.changes,
    source: row.source,
    txId: row.txId.toString(),
    dbUser: row.dbUser,
    appName: row.appName,
    clientAddr: row.clientAddr,
    user: row.userId ? users.get(row.userId) ?? { id: row.userId, firstName: 'Deleted user', lastName: '', email: '' } : null,
  };
}

export class ChangeLogService {
  entities() {
    return Object.entries(CHANGE_LOG_ENTITIES).map(([entity, meta]) => ({ entity, ...meta }));
  }

  async list(filters: ChangeLogFilters, page: number, limit: number) {
    const where = buildChangeLogWhere(filters, await branchUserIds(filters.branchId));
    const [rows, total] = await Promise.all([
      prisma.changeLog.findMany({ where, orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.changeLog.count({ where }),
    ]);
    const users = await usersById(rows.map((r) => r.userId));
    return {
      changes: rows.map((r) => toDto(r, users)),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** One change, or null when it does not exist or is outside the caller's branch. */
  async get(id: bigint, branchId?: string) {
    const where = buildChangeLogWhere({ branchId }, await branchUserIds(branchId));
    const row = await prisma.changeLog.findFirst({ where: { AND: [where, { id }] } });
    if (!row) return null;
    return toDto(row, await usersById([row.userId]));
  }

  /** Every change to one record, oldest first (record history). */
  async history(entity: string, recordId: string, branchId?: string) {
    const where = buildChangeLogWhere({ entity, branchId }, await branchUserIds(branchId));
    const rows = await prisma.changeLog.findMany({ where: { AND: [where, { recordId }] }, orderBy: { id: 'asc' }, take: 1000 });
    const users = await usersById(rows.map((r) => r.userId));
    return rows.map((r) => toDto(r, users));
  }

  /** Legacy "Summary" print: count per user × record type × action. */
  async summary(filters: ChangeLogFilters) {
    const where = buildChangeLogWhere(filters, await branchUserIds(filters.branchId));
    const groups = await prisma.changeLog.groupBy({
      by: ['userId', 'source', 'entity', 'action'],
      where,
      _count: { _all: true },
    });
    const users = await usersById(groups.map((g) => g.userId));
    const rows = groups.map((g) => {
      const user = g.userId ? users.get(g.userId) : undefined;
      const meta = CHANGE_LOG_ENTITIES[g.entity];
      return {
        userId: g.userId,
        userName: user
          ? `${user.firstName} ${user.lastName}`.trim()
          : g.userId ? 'Deleted user' : g.source === 'DB' ? 'Outside the app' : 'System (no user)',
        source: g.source,
        entity: g.entity,
        entityLabel: meta?.label ?? g.entity,
        group: meta?.group ?? null,
        action: g.action,
        count: g._count._all,
      };
    });
    rows.sort((a, b) => a.userName.localeCompare(b.userName) || a.entityLabel.localeCompare(b.entityLabel) || a.action.localeCompare(b.action));
    return { rows, total: rows.reduce((sum, r) => sum + r.count, 0) };
  }
}

export default ChangeLogService;
