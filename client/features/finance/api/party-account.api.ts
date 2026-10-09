import { apiGet, apiPost } from '@/lib/api/apiClient';
import { API_ROUTES } from '@/lib/constants/apiRoutes';

export type PartyDocument = { id: string; kind: 'INVOICE' | 'RECEIPT' | 'NOTE'; number: string; date: string; amount: number; balance: number };
export type PartyAccount = { customer: { id: string; code: string | null; name: string; partyStatus: string }; outstanding: number; availableCredit: number; netOutstanding: number };
export type AdjustmentSelection = { id: string; kind: PartyDocument['kind']; amount: number };
export type AdjustmentInput = { customerId: string; branchId: string; date: string; source: 'ADVANCE_ADJUSTMENT' | 'FIFO'; idempotencyKey: string; debits: AdjustmentSelection[]; credits: AdjustmentSelection[] };
export type AdjustmentBatch = { id: string; date: string; source: string; amount: number | string; reversedAt: string | null; reverseRemark: string | null; tallyPostedAt: string | null };
export type DocumentPage = { documents: PartyDocument[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
export type FifoPreview = { debits: AdjustmentSelection[]; credits: AdjustmentSelection[]; debitDocuments: PartyDocument[]; creditDocuments: PartyDocument[]; amount: number; limit: number };
export type OpeningInput = { customerId: string; branchId: string; direction: 'DEBIT' | 'CREDIT'; date: string; amount: number; narration: string; idempotencyKey: string };
const scope = (branchId?: string) => branchId ? '?branchId='+encodeURIComponent(branchId) : '';
export async function getPartyAccount(customerId: string, branchId?: string) {
  return (await apiGet<{ account: PartyAccount }>(API_ROUTES.finance.partyAccount(customerId)+scope(branchId))).account;
}
export function getPartyDocuments(customerId: string, branchId: string, side: 'DEBIT' | 'CREDIT', openOnly: boolean, page: number) {
  return apiGet<DocumentPage>(API_ROUTES.finance.partyDocuments(customerId)+scope(branchId)+'&side='+side+'&openOnly='+openOnly+'&page='+page+'&pageSize=25');
}
export async function getAdjustmentBatches(customerId: string, branchId: string) {
  return (await apiGet<{ batches: AdjustmentBatch[] }>(API_ROUTES.finance.partyAdjustments(customerId)+scope(branchId))).batches;
}
export async function previewFifo(customerId: string, branchId: string) {
  return (await apiPost<{ preview: FifoPreview }>(API_ROUTES.finance.fifoPreview,{ customerId,branchId,date: new Date().toISOString() })).preview;
}
export function saveAdjustment(input: AdjustmentInput) { return apiPost(API_ROUTES.finance.adjustments,input); }
export function reverseAdjustment(id: string, remark: string) { return apiPost(API_ROUTES.finance.adjustments+'/'+id+'/reverse',{ remark }); }
export function createOpening(input: OpeningInput) { return apiPost(API_ROUTES.finance.openingBalances,input); }
