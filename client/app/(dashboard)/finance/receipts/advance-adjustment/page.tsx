"use client";
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PartyAdjustmentWorkspace } from '@/features/finance/components/party-adjustment-workspace';
function AdjustmentPage() { const search=useSearchParams(); return <PartyAdjustmentWorkspace initialCustomerId={search.get('customerId') ?? ''} />; }
export default function Page() { return <Suspense fallback={<p className="p-6" role="status">Loading adjustment...</p>}><AdjustmentPage /></Suspense>; }
