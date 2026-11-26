import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";

type VehicleQuery = {
  branchId?: string;
  after?: string;
  closedFrom?: string;
  closedTo?: string;
};

type VehicleResult = {
  vehicles: Array<{
    id: string;
    registrationNumber: string | null;
    vin: string;
    jobs: Array<{
      id: string;
      number: string;
      date: string;
      customer: string | null;
      branch: string;
      serviceType: string | null;
      status: string;
      payers: string[];
    }>;
  }>;
  nextCursor: string | null;
};

export function useMultiJobVehicles(params: VehicleQuery) {
  return useQuery({
    queryKey: ["multi-job-vehicles", params],
    queryFn: ({ signal }) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      return apiGet<VehicleResult>(`${API_ROUTES.service.jobCards.multiJobVehicles}?${query}`, { signal });
    },
  });
}
