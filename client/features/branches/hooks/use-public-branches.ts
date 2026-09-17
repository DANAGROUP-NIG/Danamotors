// client/features/branches/hooks/use-public-branches.ts
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/apiClient';

export function usePublicBranches() {
  return useQuery({
    queryKey: ['branches', 'public'],
    queryFn: () =>
      apiGet<{ branches: { id: string; name: string; city?: string | null }[] }>(
        '/branches',
      ),
    staleTime: 5 * 60 * 1000, // 5 minutes — branch list doesn't change often
  });
}