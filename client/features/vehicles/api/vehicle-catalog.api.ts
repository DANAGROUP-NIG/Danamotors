import { apiGet } from "@/lib/api/apiClient";
export type CatalogModel = { id: string; make: string; name: string; searchName: string; aliases: string[]; yearStart: number; yearEnd: number | null };
export type CatalogGeneration = { id: string; name: string; yearStart: number; yearEnd: number | null; engines: { id: string; label: string; fuelType: string | null; powerHp: number | null; transmission: string | null; drivetrain: string | null }[] };
export const getCatalogModels = () => apiGet<CatalogModel[]>("/vehicle-catalog/models");
export const getCatalogOptions = (modelId: string) => apiGet<CatalogGeneration[]>(`/vehicle-catalog/models/${modelId}/options`);
export function normalizeCatalogName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
export function matchesModel(model: CatalogModel, search: string) {
  const key = normalizeCatalogName(search);
  return [model.searchName, ...model.aliases].some(name => name.includes(key));
}
