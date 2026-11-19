"use client";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost } from '@/lib/api/apiClient';
import { jobCardKeys } from '../api/job-card.keys';

function errorMessage(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}

export function useJobPartsActions(jobCardId: string, branchId: string) {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) }),
      cache.invalidateQueries({ queryKey: jobCardKeys.lists(), refetchType: 'none' }),
    ]);
  };
  const receive = useMutation({
    mutationFn: ({ id, signatureImage }: { id: string; signatureImage: string }) => apiPost(`/workshop/parts/${id}/receive`, { confirmed: true, signatureImage }),
    onSuccess: async () => { toast.success('Parts collection recorded'); await refresh(); },
  });
  const returnPart = useMutation({
    mutationFn: ({ id, quantity, reason }: { id: string; quantity: number; reason: string }) => apiPost('/inventory/returns', { partIssuanceId: id, branchId, quantity, reason }),
    onSuccess: async () => {
      toast.success('Part return recorded');
      await Promise.all([refresh(), cache.invalidateQueries({ queryKey: ['service-transactions'] }), cache.invalidateQueries({ queryKey: ['inventory'] })]);
    },
  });
  return { receive, returnPart, receiveError: receive.isError ? errorMessage(receive.error, 'Collection could not be recorded. Check your assignment, then retry collection.') : undefined,
    returnError: returnPart.isError ? errorMessage(returnPart.error, 'Return could not be recorded. Check the remaining quantity and reason.') : undefined };
}
