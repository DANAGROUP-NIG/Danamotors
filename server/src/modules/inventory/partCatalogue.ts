/**
 * Mobis catalogue (legacy FullpartList).
 *
 * The legacy CPD loaded the Mobis price list into FullpartList in bulk. Part Enquiry looked a part up
 * in Part Master first and then in FullpartList, and Create Part copied the catalogue row into Part
 * Master. Here Part Query does the lookup and the create. This file only checks and shapes price list
 * rows; the service saves them.
 */

export interface PriceListRow {
  partNumber: string;
  name: string;
  partFlag?: string;
  priceCategoryCode?: string | null;
  dealerRate: number;
  retailRate?: number | null;
}

export interface CatalogueCategory {
  code: string;
  markupMultiplier: number;
  isActive: boolean;
}

export interface CatalogueItemInput {
  partNumber: string;
  name: string;
  partFlag: string;
  priceCategoryCode: string | null;
  dealerRate: number;
  retailRate: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Normalises one upload batch. Retail rate is the list's own, else dealer rate x the category
 * multiplier, as on legacy FullpartList. Returns problems instead of items when any row is wrong,
 * so a batch is saved whole or not at all.
 */
export function preparePriceList(
  rows: PriceListRow[],
  categories: CatalogueCategory[],
): { items: CatalogueItemInput[]; problems: string[] } {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const seen = new Set<string>();
  const problems: string[] = [];
  const items: CatalogueItemInput[] = [];

  for (const row of rows) {
    const partNumber = row.partNumber.trim().toUpperCase();
    const code = row.priceCategoryCode?.trim().toUpperCase() || null;
    if (seen.has(partNumber)) {
      problems.push(`${partNumber} appears more than once`);
      continue;
    }
    seen.add(partNumber);
    const category = code ? byCode.get(code) : undefined;
    if (code && !category) {
      problems.push(`${partNumber}: unknown price category ${code}`);
      continue;
    }
    if (category && !category.isActive) {
      problems.push(`${partNumber}: price category ${code} is inactive`);
      continue;
    }
    const retailRate =
      row.retailRate != null && row.retailRate > 0
        ? round2(row.retailRate)
        : category
          ? round2(row.dealerRate * category.markupMultiplier)
          : null;
    items.push({
      partNumber,
      name: row.name.trim(),
      partFlag: row.partFlag?.trim().toUpperCase() || "O",
      priceCategoryCode: code,
      dealerRate: row.dealerRate,
      retailRate,
    });
  }
  return problems.length ? { items: [], problems } : { items, problems };
}
