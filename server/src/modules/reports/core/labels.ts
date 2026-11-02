import type { AppliedFilter, FilterKey, ReportDb } from './types';

export const FILTER_LABELS: Record<FilterKey, string> = {
  model: 'Model',
  variant: 'Variant',
  serviceType: 'Service type',
  team: 'Service group',
  receivedBy: 'Received by',
  deliveredBy: 'Delivered by',
  technician: 'Technician',
  complaint: 'Customer request',
  labourOperation: 'Labour operation',
};

const MASTER_KEYS: FilterKey[] = ['model', 'variant', 'serviceType', 'team', 'complaint'];
const USER_KEYS: FilterKey[] = ['receivedBy', 'deliveredBy', 'technician'];

/** Names for the filters a report applied, for the screen and print header. Empty values = All. */
export async function resolveFilterLabels(
  db: ReportDb,
  keys: FilterKey[],
  query: Partial<Record<FilterKey, string[] | undefined>>,
): Promise<AppliedFilter[]> {
  const ids = (list: FilterKey[]) => list.filter((key) => keys.includes(key)).flatMap((key) => query[key] ?? []);
  const masterIds = ids(MASTER_KEYS);
  const userIds = ids(USER_KEYS);
  const labourIds = ids(['labourOperation']);

  const [masters, users, labour] = await Promise.all([
    masterIds.length ? db.workshopMaster.findMany({ where: { id: { in: masterIds } }, select: { id: true, description: true } }) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    labourIds.length ? db.labourItem.findMany({ where: { id: { in: labourIds } }, select: { id: true, code: true, description: true } }) : [],
  ]);
  const names = new Map<string, string>([
    ...masters.map((m) => [m.id, m.description] as [string, string]),
    ...users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()] as [string, string]),
    ...labour.map((l) => [l.id, `${l.code} ${l.description}`] as [string, string]),
  ]);

  return keys.map((key) => ({
    key,
    label: FILTER_LABELS[key],
    values: (query[key] ?? []).map((id) => names.get(id) ?? 'Unknown'),
  }));
}
