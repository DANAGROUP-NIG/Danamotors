import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";

export type RoleListItem = {
  id: string;
  name: string;
  description?: string | null;
  usersCount?: number;
  permissionsCount?: number;
  _count?: { permissions?: number };
  permissions?: string[];
};

export type RoleDetail = {
  id: string;
  name: string;
  description?: string | null;
  permissions: PermissionItem[];
};

export type PermissionItem = {
  id: string;
  name: string;
  description?: string | null;
};

export async function getRoleListRequest(): Promise<{ roles: RoleListItem[] }> {
  return apiGet<{ roles: RoleListItem[] }>(API_ROUTES.administration.roles.base);
}

export async function getRoleRequest(id: string): Promise<{ role: RoleDetail }> {
  return apiGet<{ role: RoleDetail }>(API_ROUTES.administration.roles.detail(id));
}

export async function getPermissionListRequest(): Promise<{ permissions: PermissionItem[] }> {
  return apiGet<{ permissions: PermissionItem[] }>(API_ROUTES.administration.permissions.base);
}

export async function createRoleRequest(payload: {
  name: string;
  description?: string;
  permissions?: string[];
}): Promise<{ role: RoleDetail }> {
  return apiPost<{ role: RoleDetail }, typeof payload>(
    API_ROUTES.administration.roles.base,
    payload,
  );
}

export async function updateRoleRequest(
  id: string,
  payload: { name?: string; description?: string },
): Promise<{ role: RoleDetail }> {
  return apiPut<{ role: RoleDetail }, typeof payload>(
    API_ROUTES.administration.roles.detail(id),
    payload,
  );
}

export async function updateRolePermissionsRequest(
  id: string,
  permissions: string[],
): Promise<{ role: RoleDetail }> {
  return apiPut<{ role: RoleDetail }, { permissions: string[] }>(
    `${API_ROUTES.administration.roles.base}/${id}/permissions`,
    { permissions },
  );
}

export async function deleteRoleRequest(id: string): Promise<void> {
  return apiDelete<void>(API_ROUTES.administration.roles.detail(id));
}
