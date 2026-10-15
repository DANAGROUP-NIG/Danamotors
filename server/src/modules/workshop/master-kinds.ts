import { z } from 'zod';
import { BadRequestError } from '../../shared/errors/appError';

// Every simple legacy code list lives in WorkshopMaster. This table says which
// parent each kind hangs from and which extra legacy fields it keeps in
// `attributes`, so one table and one screen serve all of them.
export const MASTER_KINDS = [
  'SERVICE_TYPE',
  'BAY',
  'COMPLAINT',
  'TEAM',
  'LATE_REASON',
  'MAKE',
  'PRODUCT',
  'MODEL',
  'VARIANT',
  'COLOUR',
  'COLOUR_TYPE',
  'TYRE_MAKE',
  'BATTERY_MAKE',
  'VEHICLE_SYSTEM',
  'VEHICLE_GROUP',
  'DEPARTMENT',
  'DESIGNATION',
  'SALUTATION',
  'ZONE',
  'STATE',
  'CITY',
  'SEGMENT',
  'UOM',
  'TAX_CATEGORY',
  'TAX_FORM',
] as const;

export type MasterKind = typeof MASTER_KINDS[number];

type ParentRule = { kind: MasterKind; required: boolean };

export const MASTER_PARENTS: Partial<Record<MasterKind, ParentRule>> = {
  PRODUCT: { kind: 'MAKE', required: true },
  MODEL: { kind: 'PRODUCT', required: true },
  VARIANT: { kind: 'MODEL', required: true },
  COLOUR: { kind: 'MODEL', required: true },
  VEHICLE_GROUP: { kind: 'VEHICLE_SYSTEM', required: true },
  // Legacy defects carry a system and usually a group; the group implies the system.
  COMPLAINT: { kind: 'VEHICLE_GROUP', required: false },
  STATE: { kind: 'ZONE', required: false },
  CITY: { kind: 'STATE', required: false },
};

// Vehicle catalogue rows are referenced by vehicles and rates, so their parent is fixed once saved.
export const FIXED_PARENT_KINDS: MasterKind[] = ['PRODUCT', 'MODEL', 'VARIANT', 'COLOUR'];

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const MASTER_ATTRIBUTES: Partial<Record<MasterKind, z.ZodTypeAny>> = {
  PRODUCT: z.object({
    includeInReports: z.boolean().optional(),
  }).strict(),
  MODEL: z.object({
    modelId: text(10),
    basicModel: text(10),
    productLine: text(10),
  }).strict(),
  VARIANT: z.object({
    features: text(2000),
  }).strict(),
  COLOUR: z.object({
    colourType: text(20),
  }).strict(),
  BAY: z.object({
    bayCategory: z.enum(['PDI', 'SERVICE', 'ACCIDENTAL']).nullable().optional(),
  }).strict(),
  COMPLAINT: z.object({
    majorDefect: z.boolean().optional(),
    usedIn: z.enum(['WARRANTY', 'BEYOND_WARRANTY', 'BOTH']).nullable().optional(),
  }).strict(),
  DESIGNATION: z.object({
    hierarchy: z.number().int().min(1).max(99).nullable().optional(),
    // Legacy department letter (E, P, C, M); names live in the DEPARTMENT list.
    department: text(10),
    containsGroup: z.boolean().optional(),
    canReceiveVehicle: z.boolean().optional(),
    canDeliverVehicle: z.boolean().optional(),
  }).strict(),
  SALUTATION: z.object({
    letterReference: text(50),
  }).strict(),
  SEGMENT: z.object({
    segmentType: text(20),
  }).strict(),
  UOM: z.object({
    decimalAllowed: z.boolean().optional(),
  }).strict(),
  TAX_FORM: z.object({
    applicableAgainstLocalSale: z.boolean().optional(),
    formRequired: z.boolean().optional(),
  }).strict(),
};

export function parseAttributes(kind: MasterKind, attributes: unknown) {
  if (attributes === undefined || attributes === null)
    return attributes;

  const schema = MASTER_ATTRIBUTES[kind];
  if (!schema)
    throw new BadRequestError('This master has no extra fields');

  const result = schema.safeParse(attributes);
  if (!result.success)
    throw new BadRequestError(`Invalid ${kind.toLowerCase().replace(/_/g, ' ')} fields: ${result.error.issues.map(issue => [issue.path.join('.'), issue.message].filter(Boolean).join(' ')).join('; ')}`);

  return result.data as Record<string, unknown>;
}
