// Legacy Part Master codes, as the legacy dropdowns name them.

// Legacy "Source of Purchase" (part flag), plus U and R for second-hand and repaired parts.
export const PART_FLAG_LABELS: Record<string, string> = {
  O: "Original part",
  A: "Authorised source",
  F: "FOC item",
  L: "Local",
  U: "Second-hand / used",
  R: "Repaired",
};

// The same codes as part sources on estimates and issues. Internal only: never shown to customers.
export const PART_SOURCE_LABELS: Record<string, string> = {
  O: "Mobis (original part)",
  A: "Authorised source",
  F: "FOC item",
  L: "Local purchase",
  U: "Second-hand / used",
  R: "Repaired",
};
export const PART_SOURCE_CODES = Object.keys(PART_SOURCE_LABELS);
export const partSourceLabel = (code?: string | null) => (code ? PART_SOURCE_LABELS[code] ?? code : "");

// Legacy part type (partmast.parttype).
export const PART_TYPE_LABELS: Record<string, string> = {
  S: "Spare part",
  O: "Oil",
  A: "Accessory",
};

/** "O · Original part", or the bare code when it is not a legacy one. */
export const codeLabel = (labels: Record<string, string>, code: string) => (labels[code] ? `${code} · ${labels[code]}` : code);
