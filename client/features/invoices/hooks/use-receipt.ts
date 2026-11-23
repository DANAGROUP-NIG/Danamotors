"use client";
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/apiClient';

export type ReceiptDocument = {
  id: string; receiptNumber: string; issuedAt: string; amount: number; advanceAmount: number;
  mode: string; status: string; reference?: string | null; notes?: string | null; cancelRemark?: string | null;
  branch?: { name: string } | null; bank?: { name: string } | null;
  customer: { companyName?: string | null; firstName: string; lastName: string };
  issuedBy?: { firstName: string; lastName: string } | null;
  advanceSnapshot?: { jobNumber: string; registrationNumber: string | null; customerName: string; branchName: string; estimateNumber: string | null; estimateVersion: number; estimateTotal: number; receivedAmount: number; paidPercent: number | null; balanceAmount: number; excessAmount: number } | null;
  advanceJobCardId?: string | null;
  allocations: { amount: number; invoice?: { invoiceNumber: string } | null }[];
};

export function useReceipt(id: string, enabled: boolean) {
  return useQuery({ queryKey: ['finance', 'receipt', id], queryFn: () => apiGet<{ receipt: ReceiptDocument }>(`/finance/receipts/${id}`), enabled });
}
