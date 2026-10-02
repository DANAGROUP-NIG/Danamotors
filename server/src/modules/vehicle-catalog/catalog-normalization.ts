/** Keep display names untouched. Search keys deliberately collapse punctuation aliases. */
export function normalizeCatalogName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
export function catalogAliases(name: string): string[] {
  return [...new Set(name.split('/').map(normalizeCatalogName).filter(Boolean))];
}
