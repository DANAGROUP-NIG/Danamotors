/**
 * Legacy CSCMaster values (identical for every model in Lagos and Abuja) and a neutral list of
 * closure reasons. Used by the base seed; the migration 20261121100000_csc inserts the same rows.
 */
export const CSC_DEFAULT_EFFECTIVE_DATE = '2010-09-13';

export const CSC_DEFAULT_RULES = [
  { code: '1F', dueDays: 30, dueKm: 1000, rotationDays: 30, rotationKm: 1000, followUp1Days: 15, followUp2Days: 5, variationDays: 15, variationKm: 500 },
  { code: '2F', dueDays: 90, dueKm: 5000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 },
  { code: '3F', dueDays: 180, dueKm: 10000, rotationDays: 180, rotationKm: 10000, followUp1Days: 15, followUp2Days: 5, variationDays: 90, variationKm: 5000 },
  { code: 'RG', dueDays: 270, dueKm: 15000, rotationDays: 90, rotationKm: 5000, followUp1Days: 15, followUp2Days: 5, variationDays: 45, variationKm: 2500 },
] as const;

// TODO(confirm): Lagos and Abuja kept different reason lists; this is one company-wide list.
export const CSC_DEFAULT_REASONS = [
  { code: 'R0001', description: 'Presently customer not available', shortDescription: 'NOTAVAIL', closureType: 'PARTIAL' },
  { code: 'R0002', description: 'Phone switched off or not reachable', shortDescription: 'NOREACH', closureType: 'PARTIAL' },
  { code: 'R0003', description: 'Customer not willing to come', shortDescription: 'NOTWILL', closureType: 'FINAL' },
  { code: 'R0004', description: 'Vehicle sold', shortDescription: 'SOLD', closureType: 'FINAL' },
  { code: 'R0005', description: 'Serviced at another workshop', shortDescription: 'OUTSIDE', closureType: 'FINAL' },
  { code: 'R0006', description: 'Wrong or invalid phone number', shortDescription: 'WRONGNO', closureType: 'FINAL' },
  { code: 'R0007', description: 'Customer asked to call back later', shortDescription: 'CALLBACK', closureType: 'PARTIAL' },
  { code: 'R0008', description: 'Customer relocated', shortDescription: 'RELOCATED', closureType: 'FINAL' },
] as const;
