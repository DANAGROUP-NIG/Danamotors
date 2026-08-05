import { useQuery } from "@tanstack/react-query";
import { roleKeys } from "../api/user.keys";
import { getRolesRequest } from "../api/user.api";

export function useRoles() {
  return useQuery({
    queryKey: roleKeys.lists(),
    queryFn: () => getRolesRequest(),
  });
}
