import type { ServiceCategory } from './master-kinds';

// Reference defaults from issue #72. These do not implement free-service eligibility.
export const LEGACY_SERVICE_TYPES = [
  ['1F', 'FIRST SERVICE', 'COMPANY', true],
  ['2F', 'SECOND SERVICE', 'COMPANY', true],
  ['3F', 'THIRD SERVICE', 'COMPANY', true],
  ['PD', 'PDI SERVICE', 'COMPANY', false],
  ['BD', 'BEFORE DELIVERY WORK', 'COMPANY', false],
  ['DI', 'DFM INSPECTION', 'COMPANY', false],
  ['1P', 'PREPAID MAINTENANCE1', 'CUSTOMER', false],
  ['2P', 'PREPAID MAINTENANCE2', 'CUSTOMER', false],
  ['3P', 'PREPAID MAINTENANCE3', 'CUSTOMER', false],
  ['4P', 'PREPAID MAINTENANCE4', 'CUSTOMER', false],
  ['AC', 'ACCIDENTAL REPAIR', 'CUSTOMER', false],
  ['CN', 'CNG CONVERTION', 'CUSTOMER', false],
  ['IJ', 'WORKSHOP (INTERNAL)', 'CUSTOMER', false],
  ['KS', 'KIA MOBILE SERVICE', 'CUSTOMER', false],
  ['RG', 'PAID SERVICE', 'CUSTOMER', false],
  ['RJ', 'REPEAT JOB', 'CUSTOMER', false],
  ['RR', 'RUNNING REPAIR', 'CUSTOMER', false],
  ['RW', 'MINOR REPAIRS', 'CUSTOMER', false],
  ['SC', 'SERVICE CAMPAIGN', 'CUSTOMER', false],
] as const;

// MIS service category of a service type, following the legacy vehicle history card (#97).
// The migration 20261103100000_mis_reports backfills existing service types with the same rule.
export function defaultServiceCategory(code: string, freeService = false, preDelivery = false): ServiceCategory {
  const upper = code.trim().toUpperCase();
  if (['1F', '2F', '3F', 'DI', 'P2'].includes(upper)) return 'FREE';
  if (preDelivery || upper === 'PD' || upper === 'BD') return 'PDI';
  if (upper === 'RR' || upper === 'RU') return 'RUNNING_REPAIR';
  if (upper === 'AC') return 'ACCIDENTAL';
  if (['RG', 'SC', 'KS', '1P', '2P', '3P', '4P'].includes(upper) || /^\d+K?$/.test(upper)) return 'PAID';
  return freeService ? 'FREE' : 'OTHER';
}

// Free service due limits from the legacy service detail master: 1F within 30 days / 1,000 km and
// 2F within 90 days / 5,000 km of the sale date. 3F has no limit.
export function freeServiceDueLimits(code: string): { daysLimit: number; mileageLimit: number } | null {
  if (code === '1F') return { daysLimit: 30, mileageLimit: 1000 };
  if (code === '2F') return { daysLimit: 90, mileageLimit: 5000 };
  return null;
}

export function rioServiceTypeCharge(code: string) {
  if (code === 'RG') return { serviceCharge: 15100, previousCharge: 12800, effectiveFrom: new Date('2022-04-20T00:00:00Z') };
  if (code === 'RR' || code === 'AC') return { serviceCharge: 2100, previousCharge: 1800, effectiveFrom: new Date('2022-04-20T00:00:00Z') };
  return { serviceCharge: 0, previousCharge: null, effectiveFrom: null };
}
