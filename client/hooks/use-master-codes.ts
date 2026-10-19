import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";

type MasterCode = { code: string; description: string };

/** Active codes of a workshop master list (UOM, TAX_CATEGORY, VEHICLE_SYSTEM...) for input suggestions. */
export function useMasterCodes(kind: string) {
  return useQuery({
    queryKey: ["master-codes", kind],
    queryFn: async () => (await apiGet<{ items: MasterCode[] }>(`/workshop-masters?kind=${kind}&limit=100`)).items,
    staleTime: 5 * 60_000,
  });
}
