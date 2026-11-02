"use client";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPut } from '@/lib/api/apiClient';
import { jobCardKeys } from '@/features/job-cards/api/job-card.keys';
export type DocumentLine = { id: string; description: string; sparePartId?: string; partNumber?: string; partSource?: string; uom?: string; quantityRequired?: number; quantityIssued?: number; quantity?: number; rate: string | number; amount: string | number; approvedAmount?: string | number; customerAmount?: string | number; approvalPercent?: number; customerPercent?: number; returns?: { quantity: number; status: string }[]; labourItemId?: string; technicianId?: string | null; mechanicId?: string | null; groupId?: string | null; standardHours?: number; chargedHours?: number; hours?: number; labourItem?: { code: string }; technician?: { firstName: string; lastName: string } | null; mechanic?: { name: string } | null; chargeLine?: { chargeType: string } | null; requisitionLine?: { partNumber: string; description: string } };
export type ServiceSlip = { id: string; requisitionNumber?: string; returnNumber?: string; slipNumber?: string; status?: string; chargeType?: string; requisition?: { requisitionNumber: string }; createdAt: string; lines: DocumentLine[]; totals?: Record<string, number>; jobCard?: { jobNumber: string; mileage?: number; vehicle?: { registrationNumber?: string; vin: string; model?: string; trim?: string } }; branch?: { name: string } };
export function useServiceData<T>(url: string, enabled = true) {
  return useQuery({ queryKey: ['service-transactions', url], queryFn: () => apiGet<T>(url), enabled });
}
export function useServiceAction<T = unknown>() {
  const cache = useQueryClient();
  return useMutation({ mutationFn: ({ url, method = 'post', body }: { url: string; method?: 'post' | 'put'; body: unknown }) => method === 'put' ? apiPut<T>(url, body) : apiPost<T>(url, body), onSuccess: () => {
    void cache.invalidateQueries({ queryKey: ['service-transactions'] });
    void cache.invalidateQueries({ queryKey: jobCardKeys.all });
    void cache.invalidateQueries({ queryKey: ['appointments'] });
    void cache.invalidateQueries({ queryKey: ['inventory'] });
    void cache.invalidateQueries({ queryKey: ['workshop-picker'] });
    toast.success('Saved');
  }, onError: (error: unknown) => toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not save. Review the details and try again.') });
}
