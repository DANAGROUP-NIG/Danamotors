/**
 * A staff role as people read it: "ServiceAdviser" becomes "Service advisor". The one place the
 * app turns role codes into words, so no screen shows a raw role code.
 */
// The role is stored as "ServiceAdviser"; the app's wording is "advisor".
const OVERRIDES: Record<string, string> = { ServiceAdviser: "Service advisor" };

export function roleLabel(role: string | null | undefined): string {
  if (!role?.trim()) return "Staff member";
  if (OVERRIDES[role]) return OVERRIDES[role];
  const words = role
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  // Keep acronyms (CCU, PDI) as they are; lower-case the other words after the first.
  return words.map((word, index) => (index === 0 || /^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())).join(" ");
}
