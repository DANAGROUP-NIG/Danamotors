import { apiGet } from "@/lib/api/apiClient";
export type CatalogModel = { id: string; make: string; name: string; searchName: string; aliases: string[]; yearStart: number; yearEnd: number | null };
export type CatalogGeneration = { id: string; name: string; yearStart: number; yearEnd: number | null; bodyType: string | null; engines: { id: string; label: string; fuelType: string | null; powerHp: number | null; cylinders: number | null; displacementCc: number | null; transmission: string | null; drivetrain: string | null }[] };
export const getCatalogModels = (signal?: AbortSignal, refresh = false) => apiGet<CatalogModel[]>(
  refresh ? `/vehicle-catalog/models?refresh=1&request=${Date.now()}` : "/vehicle-catalog/models",
  { signal },
);
export const getCatalogOptions = (modelId: string, signal?: AbortSignal) => apiGet<CatalogGeneration[]>(`/vehicle-catalog/models/${modelId}/options`, { signal });
export function normalizeCatalogName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
function searchableNames(model: CatalogModel) {
  return [model.searchName, ...model.aliases].flatMap(name =>
    [name, `${normalizeCatalogName(model.make)} ${name}`],
  );
}
export function matchesModel(model: CatalogModel, search: string) {
  const key = normalizeCatalogName(search);
  return searchableNames(model).some(name => name.includes(key));
}
export function isExactModelMatch(model: CatalogModel, search: string) {
  return searchableNames(model).includes(normalizeCatalogName(search));
}
