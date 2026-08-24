import { useQuery } from "@tanstack/react-query";
import { userKeys } from "../api/user.keys";
import { getUserRequest } from "../api/user.api";

export function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => getUserRequest(id),
    enabled: !!id,
  });
}
