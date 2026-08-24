import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createRoleRequest,
  deleteRoleRequest,
  getPermissionListRequest,
  getRoleListRequest,
  getRoleRequest,
  updateRolePermissionsRequest,
  updateRoleRequest,
} from "../api/role.api";

export const roleAdminKeys = {
  all: ["admin-roles"] as const,
  lists: () => [...roleAdminKeys.all, "list"] as const,
  details: () => [...roleAdminKeys.all, "detail"] as const,
  detail: (id: string) => [...roleAdminKeys.details(), id] as const,
  permissions: () => [...roleAdminKeys.all, "permissions"] as const,
};

export function useAdminRoles() {
  return useQuery({
    queryKey: roleAdminKeys.lists(),
    queryFn: getRoleListRequest,
  });
}

export function useAdminRole(id: string) {
  return useQuery({
    queryKey: roleAdminKeys.detail(id),
    queryFn: () => getRoleRequest(id),
    enabled: !!id,
  });
}

export function useAdminPermissions() {
  return useQuery({
    queryKey: roleAdminKeys.permissions(),
    queryFn: getPermissionListRequest,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRoleRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.lists() });
      toast.success("Role created successfully");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to create role";
      toast.error(message);
    },
  });
}

export function useUpdateRole(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { name?: string; description?: string }) =>
      updateRoleRequest(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.lists() });
      toast.success("Role updated");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to update role";
      toast.error(message);
    },
  });
}

export function useUpdateRolePermissions(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (permissions: string[]) =>
      updateRolePermissionsRequest(id, permissions),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.lists() });
      toast.success("Permissions saved");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save permissions";
      toast.error(message);
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteRoleRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: roleAdminKeys.lists() });
      toast.success("Role deleted");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to delete role";
      toast.error(message);
    },
  });
}
