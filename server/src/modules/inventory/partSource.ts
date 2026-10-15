import { BadRequestError } from "../../shared/errors/appError";

// Part sources share the legacy part flag codes ("Source of purchase"), plus U and R.
// A part's own flag is priced by SparePart.retailRate; any other source needs a
// SparePartSourcePrice row. Sources are internal and never shown to the customer.
export const PART_SOURCES = {
  O: "Mobis (original part)",
  A: "Authorised source",
  F: "FOC item",
  L: "Local purchase",
  U: "Second-hand / used",
  R: "Repaired",
} as const;

export type PartSourceCode = keyof typeof PART_SOURCES;
export const PART_SOURCE_CODES = Object.keys(PART_SOURCES) as [PartSourceCode, ...PartSourceCode[]];

export type SourcePricedPart = {
  partNumber: string;
  partFlag: string;
  retailRate: number | null;
  sourcePrices?: { source: string; retailRate: number }[];
};

export const sourceLabel = (code: string) => PART_SOURCES[code as PartSourceCode] ?? code;

/** The source a line is charged from; lines recorded before sources default to the part's flag. */
export const resolveSource = (part: { partFlag: string }, source?: string | null) => source || part.partFlag;

/** Customer rate for the part from `source`, or null when no price is set for that source. */
export function sourceRate(part: SourcePricedPart, source?: string | null): number | null {
  const code = resolveSource(part, source);
  if (code === part.partFlag) return part.retailRate;
  return part.sourcePrices?.find((price) => price.source === code)?.retailRate ?? null;
}

export function requireSourceRate(part: SourcePricedPart, source?: string | null): number {
  const rate = sourceRate(part, source);
  if (rate == null) {
    throw new BadRequestError(`${sourceLabel(resolveSource(part, source))} price is not set for ${part.partNumber}`);
  }
  return rate;
}
