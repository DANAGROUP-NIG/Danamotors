// Part sources share the legacy part flag codes ("Source of purchase"), plus U and R.
// A local, used or repaired version of a part is its own Part Master record (a source record),
// linked to its main part by sourceOfPartId, with its own stock, rates and bin. Its source is its
// part flag. Sources are internal and never shown to the customer.
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

export const sourceLabel = (code: string) => PART_SOURCES[code as PartSourceCode] ?? code;

/** Sources a branch buys itself. CPD never supplies them on an indent. */
export const BRANCH_BOUGHT_SOURCES: string[] = ["L", "U", "R"];

/**
 * Price category for a new local, used or repaired record: legacy local purchases are priced at
 * 1.5x (category L, local consumable), far below the Mobis general category (C, 3.33x). Other
 * sources keep the main part's category.
 */
export const LOCAL_PRICE_CATEGORY = "L";
export const defaultSourceCategory = (source: string, mainCategory: string | null) =>
  BRANCH_BOUGHT_SOURCES.includes(source) ? LOCAL_PRICE_CATEGORY : mainCategory;

/** Suggested part number for a source record: the main part number and the source code, e.g. 54651-U. */
export const sourcePartNumber = (mainPartNumber: string, source: string) => `${mainPartNumber.trim()}-${source}`;

type SourceLinkedPart = { partNumber: string; partFlag: string; sourceOfPartId?: string | null };

/** Why `main` cannot take a source record from `source`, or null when it can. */
export function sourceRecordProblem(main: SourceLinkedPart & { role?: string }, source: string, existing: string[] = []) {
  if (main.sourceOfPartId) return `${main.partNumber} is itself a source record; add the source to its main part`;
  if (main.role && main.role !== "MAIN") return `${main.partNumber} is an alternate part; add the source to its main part`;
  if (source === main.partFlag) return `${main.partNumber} is already a ${sourceLabel(source)} part`;
  if (existing.includes(source)) return `${main.partNumber} already has a ${sourceLabel(source)} record`;
  return null;
}

/** Why a branch cannot indent `part` from CPD, or null when it can. CPD supplies Mobis parts. */
export function indentProblem(part: SourceLinkedPart) {
  if (part.sourceOfPartId || BRANCH_BOUGHT_SOURCES.includes(part.partFlag))
    return `${part.partNumber} is a ${sourceLabel(part.partFlag)} part, bought by the branch; it cannot be indented from CPD`;
  return null;
}

/** Prisma filter for parts a branch can indent from CPD (see indentProblem). */
export const indentablePartWhere = { sourceOfPartId: null, partFlag: { notIn: BRANCH_BOUGHT_SOURCES } };
