import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  Branch,
  BranchDetail,
  BranchListResponse,
  CreateBranchPayload,
  UpdateBranchPayload,
} from "../types/branch.types";

export async function getBranchesRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<BranchListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiGet<BranchListResponse>(
    `${API_ROUTES.branches.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getBranchRequest(
  id: string,
): Promise<{ branch: BranchDetail }> {
  return apiGet<{ branch: BranchDetail }>(
    API_ROUTES.branches.detail(id),
  );
}

export async function createBranchRequest(
  payload: CreateBranchPayload,
): Promise<{ branch: Branch }> {
  return apiPost<{ branch: Branch }, CreateBranchPayload>(
    API_ROUTES.branches.base,
    payload,
  );
}

export async function updateBranchRequest(
  id: string,
  payload: UpdateBranchPayload,
): Promise<{ branch: Branch }> {
  return apiPut<{ branch: Branch }, UpdateBranchPayload>(
    API_ROUTES.branches.detail(id),
    payload,
  );
}

export async function deleteBranchRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.branches.detail(id));
}
