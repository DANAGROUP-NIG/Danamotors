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

export function rioServiceTypeCharge(code: string) {
  if (code === 'RG') return { serviceCharge: 15100, previousCharge: 12800, effectiveFrom: new Date('2022-04-20T00:00:00Z') };
  if (code === 'RR' || code === 'AC') return { serviceCharge: 2100, previousCharge: 1800, effectiveFrom: new Date('2022-04-20T00:00:00Z') };
  return { serviceCharge: 0, previousCharge: null, effectiveFrom: null };
}
