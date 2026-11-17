"use client";
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { ReceiptDocument } from './ReceiptDocument';
import { useReceipt } from '../hooks/use-receipt';

export function ReceiptPrint({ id }: { id: string }) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('receipt:read');
  const query = useReceipt(id, allowed);
  if (!allowed) return <p role="alert">You do not have permission to view receipts.</p>;
  if (query.isPending) return <p role="status">Loading receipt…</p>;
  if (query.isError) return <div role="alert">Could not load receipt. <Button onClick={() => void query.refetch()}>Retry</Button></div>;
  return <ReceiptDocument receipt={query.data.receipt} />;
}
