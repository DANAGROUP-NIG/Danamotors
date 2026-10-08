import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createOpening, getPartyAccount, reverseAdjustment, saveAdjustment, type AdjustmentInput, type OpeningInput } from '../api/party-account.api';
import { creditKeys } from '@/features/credit/api/credit.keys';

export const partyAccountKeys = { all: ['party-account'] as const, customer: (id: string) => ['party-account',id] as const };
export function usePartyAccount(customerId: string, branchId?: string) {
  return useQuery({ queryKey: [...partyAccountKeys.customer(customerId),'summary',branchId], queryFn: () => getPartyAccount(customerId,branchId), enabled: !!customerId });
}
const message = (error: unknown) => (error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'The account could not be updated';
export function usePartyMutations(customerId: string) {
  const queryClient = useQueryClient();
  const invalidate = (documentsChanged = true) => {
    void queryClient.invalidateQueries({ queryKey: partyAccountKeys.customer(customerId) });
    void queryClient.invalidateQueries({ queryKey: creditKeys.customer(customerId) });
    if (!documentsChanged) return;
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['job-cards'] });
    void queryClient.invalidateQueries({ queryKey: ['receipt-register'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const save = useMutation({ mutationFn: (input: AdjustmentInput) => saveAdjustment(input), onSuccess: () => { invalidate(); toast.success('Adjustment saved'); }, onError: (error: unknown) => { invalidate(); toast.error(message(error)); } });
  const reverse = useMutation({ mutationFn: (input: { id: string; remark: string }) => reverseAdjustment(input.id,input.remark), onSuccess: () => { invalidate(); toast.success('Adjustment reversed'); }, onError: (error: unknown) => toast.error(message(error)) });
  const opening = useMutation({ mutationFn: (input: OpeningInput) => createOpening(input), onSuccess: () => { invalidate(false); toast.success('Opening balance recorded'); }, onError: (error: unknown) => { invalidate(false); toast.error(message(error)); } });
  return { save,reverse,opening };
}
