"use client";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/apiClient';
import { jobCardKeys } from '../api/job-card.keys';

export function useLinkJobAdvance(jobCardId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) => apiPost(`/service/job-cards/${jobCardId}/deposit`, { receiptId }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: jobCardKeys.all }),
        client.invalidateQueries({ queryKey: ['party-account'] }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
    },
  });
}
