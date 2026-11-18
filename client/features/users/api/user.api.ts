import { apiDelete, apiGet, apiPut, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type {
  CreateUserPayload,
  Role,
  UpdateUserPayload,
  UserListResponse,
  UserWithRole,
} from "../types/user.types";

export async function getUsersRequest(params?: {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: string;
  branchId?: string;
}): Promise<UserListResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.search) query.set("search", params.search);
  if (params?.roleId) query.set("roleId", params.roleId);
  if (params?.branchId) query.set("branchId", params.branchId);
  const qs = query.toString();
  return apiGet<UserListResponse>(
    `${API_ROUTES.administration.users.base}${qs ? `?${qs}` : ""}`,
  );
}

export async function getUserRequest(id: string): Promise<{ user: UserWithRole }> {
  return apiGet<{ user: UserWithRole }>(
    API_ROUTES.administration.users.detail(id),
  );
}

export async function createUserRequest(
  payload: CreateUserPayload,
): Promise<{ user: UserWithRole }> {
  return apiPost<{ user: UserWithRole }, CreateUserPayload>(
    API_ROUTES.administration.users.base,
    payload,
  );
}

export async function updateUserRequest(
  id: string,
  payload: UpdateUserPayload,
): Promise<{ user: UserWithRole }> {
  return apiPut<{ user: UserWithRole }, UpdateUserPayload>(
    API_ROUTES.administration.users.detail(id),
    payload,
  );
}

export async function getRolesRequest(): Promise<{ roles: Role[] }> {
  return apiGet<{ roles: Role[] }>(API_ROUTES.administration.roles.base);
}

export async function deleteUserRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.administration.users.detail(id));
}

/** Replaces the user's own grants and denials on top of their role. */
export async function setUserPermissionsRequest(
  id: string,
  payload: { grants: string[]; denies: string[] },
): Promise<{ user: UserWithRole }> {
  return apiPut<{ user: UserWithRole }, typeof payload>(API_ROUTES.administration.users.permissions(id), payload);
}

/** Sets a new password for another user. The user is signed out of all sessions. */
export async function resetUserPasswordRequest(id: string, newPassword: string): Promise<void> {
  await apiPost<void, { newPassword: string }>(API_ROUTES.administration.users.resetPassword(id), { newPassword });
}
