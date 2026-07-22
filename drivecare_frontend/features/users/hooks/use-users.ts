import { useQuery } from "@tanstack/react-query";
import { userKeys } from "../api/user.keys";
import { getUsersRequest } from "../api/user.api";

type UseUsersParams = {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: string;
  branchId?: string;
};

export function useUsers(params?: UseUsersParams) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => getUsersRequest(params),
  });
}
