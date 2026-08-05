import { apiGet } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";

export type SearchResults = {
  customers: { id: string; name: string; email: string }[];
  vehicles: { id: string; label: string; sublabel: string }[];
  jobCards: { id: string; label: string; sublabel: string }[];
  spareParts: { id: string; label: string; sublabel: string }[];
  users: { id: string; name: string; email: string }[];
};

type SearchApiResponse = {
  results: SearchResults;
};

export async function getGlobalSearchRequest(
  q: string,
): Promise<SearchResults> {
  const query = new URLSearchParams({ q });
  const data = await apiGet<SearchApiResponse>(
    `${API_ROUTES.search.base}?${query.toString()}`,
  );
  return data.results;
}
