// Legacy Part Master codes, as the legacy dropdowns name them.

// Legacy "Source of Purchase" (part flag).
export const PART_FLAG_LABELS: Record<string, string> = {
  O: "Original part",
  A: "Authorised source",
  F: "FOC item",
  L: "Local",
};

// Legacy part type (partmast.parttype).
export const PART_TYPE_LABELS: Record<string, string> = {
  S: "Spare part",
  O: "Oil",
  A: "Accessory",
};

/** "O · Original part", or the bare code when it is not a legacy one. */
export const codeLabel = (labels: Record<string, string>, code: string) => (labels[code] ? `${code} · ${labels[code]}` : code);
