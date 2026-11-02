/**
 * VIN range rules for the campaign "Vehicles to check" grid. They mirror the server
 * (campaign.logic.ts) so problems show while typing; the server checks again on save.
 */

/** Both bounds share manufacturer, model, check digit, year and plant; only the serial varies. */
export const VIN_RANGE_PREFIX_LENGTH = 11;

export type VinRangeDraft = { vinFrom: string; vinTo: string };

export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** Error for one VIN, or null. I, O and Q are never used in VINs. */
export function vinError(vin: string): string | null {
  if (!vin) return "is required";
  if (vin.length !== 17) return `must be 17 characters (${vin.length})`;
  const bad = vin.match(/[IOQ]/);
  if (bad) return `contains letter ${bad[0]}`;
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return "has characters other than letters and digits";
  return null;
}

/** Error for a range of normalized VINs, or null. An empty "to" means a single VIN. */
export function vinRangeError(range: VinRangeDraft): string | null {
  const to = range.vinTo || range.vinFrom;
  const fromError = vinError(range.vinFrom);
  if (fromError) return `From VIN ${fromError}`;
  const toError = vinError(to);
  if (toError) return `To VIN ${toError}`;
  if (range.vinFrom.slice(0, VIN_RANGE_PREFIX_LENGTH) !== to.slice(0, VIN_RANGE_PREFIX_LENGTH))
    return `Both VINs must share the first ${VIN_RANGE_PREFIX_LENGTH} characters`;
  if (range.vinFrom > to) return "From VIN comes after To VIN";
  return null;
}

/** Serials a range covers when the varying part is numeric, else null. */
export function vinRangeSize(range: VinRangeDraft): number | null {
  const from = range.vinFrom.slice(VIN_RANGE_PREFIX_LENGTH);
  const to = (range.vinTo || range.vinFrom).slice(VIN_RANGE_PREFIX_LENGTH);
  return /^\d+$/.test(from) && /^\d+$/.test(to) && to >= from ? Number(to) - Number(from) + 1 : null;
}

/**
 * Pasted ranges: one per line, "FROM TO" (space, tab, comma or semicolon between) or a single
 * VIN. Blank lines are ignored.
 */
export function parseVinRanges(text: string): VinRangeDraft[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [from = "", to = ""] = line.split(/[\s,;]+/).filter(Boolean);
      const vinFrom = normalizeVin(from);
      return { vinFrom, vinTo: normalizeVin(to) || vinFrom };
    });
}

export const rangeKey = (range: VinRangeDraft) => `${range.vinFrom}:${range.vinTo || range.vinFrom}`;
