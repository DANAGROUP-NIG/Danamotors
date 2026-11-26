"use client";
import { useParams } from 'next/navigation';
import { ReceiptPrint } from '@/features/invoices/components/ReceiptPrint';

export default function ReceiptPrintPage() {
  const { id } = useParams<{ id: string }>();
  return <ReceiptPrint id={id} />;
}
