// client/features/branches/hooks/use-public-branches.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export function usePublicBranches() {
  return useQuery({
    queryKey: ['branches', 'public'],
    queryFn: async () => {
      const { data } = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api'}/branches`,
      );
      return data.data as { branches: { id: string; name: string; city?: string | null }[] };
    },
    staleTime: 5 * 60 * 1000,  // 5 minutes — branch list doesn't change often
  });
}