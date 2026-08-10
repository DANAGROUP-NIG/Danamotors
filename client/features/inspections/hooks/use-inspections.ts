import { useQuery } from "@tanstack/react-query";
import { inspectionKeys } from "../api/inspection.keys";
import { getInspectionsRequest } from "../api/inspection.api";

type UseInspectionsParams = {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
};

export function useInspections(params?: UseInspectionsParams) {
  return useQuery({
    queryKey: inspectionKeys.list(params),
    queryFn: () => getInspectionsRequest(params),
  });
}
