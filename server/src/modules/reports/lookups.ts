import { z } from 'zod';
import { ROLES } from '../../shared/constants/roles';
import { branchParam } from './core/filters';
import type { ReportDb, ReportScope } from './core/types';

export const LOOKUP_SOURCES = [
  'model',
  'variant',
  'serviceType',
  'team',
  'complaint',
  'labourOperation',
  'serviceAdvisor',
  'technician',
  'campaign',
  'engineer',
  'serviceGroup',
  'partCategory',
  'freeService',
] as const;
export type LookupSource = (typeof LOOKUP_SOURCES)[number];

export const lookupSchema = z.object({
  params: z.object({ source: z.enum(LOOKUP_SOURCES) }),
  query: z.object({ branchId: branchParam }).strict(),
});

export interface LookupOption {
  id: string;
  label: string;
  code?: string | null;
  /** Model id for a variant (so the variant list follows the model filter); the type for a campaign. */
  parentId?: string | null;
  active: boolean;
}

const MASTER_KIND: Partial<Record<LookupSource, string>> = {
  model: 'MODEL',
  variant: 'VARIANT',
  serviceType: 'SERVICE_TYPE',
  team: 'TEAM',
  complaint: 'COMPLAINT',
  serviceGroup: 'VEHICLE_GROUP',
};

const STAFF_ROLE: Partial<Record<LookupSource, string>> = {
  serviceAdvisor: ROLES.SERVICE_ADVISOR,
  technician: ROLES.TECHNICIAN,
  engineer: ROLES.ENGINEER,
};

/**
 * Dropdown options for the report filters. Inactive masters and staff are included (and
 * flagged) because old jobs still refer to them.
 */
export async function listLookup(db: ReportDb, scope: ReportScope, source: LookupSource): Promise<LookupOption[]> {
  const kind = MASTER_KIND[source];
  if (kind) {
    const masters = await db.workshopMaster.findMany({
      where: { kind },
      select: { id: true, code: true, description: true, parentId: true, active: true },
      orderBy: [{ active: 'desc' }, { description: 'asc' }],
    });
    return masters.map((m) => ({ id: m.id, label: m.description, code: m.code, parentId: m.parentId, active: m.active }));
  }

  if (source === 'campaign') {
    // Campaigns are not branch-scoped. Closed ones are listed (and flagged) for history.
    const campaigns = await db.campaign.findMany({
      select: { id: true, code: true, title: true, type: true, status: true },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
    });
    return campaigns.map((c) => ({ id: c.id, label: `${c.code} · ${c.title}`, code: c.code, parentId: c.type, active: c.status !== 'CLOSED' }));
  }

  if (source === 'freeService') {
    // Service types in the FREE category, in their service order (1F, 2F, 3F…).
    const types = await db.workshopMaster.findMany({
      where: { kind: 'SERVICE_TYPE', category: 'FREE' },
      select: { id: true, code: true, description: true, active: true },
      orderBy: [{ active: 'desc' }, { displayOrder: { sort: 'asc', nulls: 'last' } }, { code: 'asc' }],
    });
    return types.map((t) => ({ id: t.id, label: t.description, code: t.code, active: t.active }));
  }

  if (source === 'partCategory') {
    // Price categories are keyed by their code (e.g. O for oil).
    const categories = await db.partCategory.findMany({ select: { code: true, description: true, isActive: true }, orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });
    return categories.map((c) => ({ id: c.code, label: c.description, code: c.code, active: c.isActive }));
  }

  const role = STAFF_ROLE[source];
  if (role) {
    const users = await db.user.findMany({
      where: { role: { name: role }, ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}) },
      select: { id: true, firstName: true, lastName: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}`.trim(), active: u.isActive }));
  }

  const items = await db.labourItem.findMany({
    select: { id: true, code: true, description: true, active: true },
    orderBy: [{ active: 'desc' }, { code: 'asc' }],
  });
  return items.map((l) => ({ id: l.id, label: l.description, code: l.code, active: l.active }));
}
