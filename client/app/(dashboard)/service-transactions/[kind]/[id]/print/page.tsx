"use client";
import { useParams } from 'next/navigation';
import { ServiceDocumentPrint } from '@/features/service-transactions/components/ServiceDocumentPrint';
export default function ServiceDocumentPrintPage() { const { kind, id } = useParams<{ kind: string; id: string }>(); return <ServiceDocumentPrint kind={kind} id={id} />; }
