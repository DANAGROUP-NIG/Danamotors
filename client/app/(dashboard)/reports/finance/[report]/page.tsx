import { PartyNotesWorkspace } from '@/features/finance/components/party-notes-workspace';

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PartyReportsPage } from '@/features/reports/components/party-reports-page';
import type { ReportKind } from '@/features/reports/api/party-report.api';
const kinds:Record<string,ReportKind>={'party-ledger':'ledger','party-outstanding':'outstanding','party-outstanding-age':'age','party-outstanding-bill':'bill'};
export default async function Page({params}:{params:Promise<{report:string}>}){const {report}=await params;if(report==='debit-note-register'||report==='credit-note-register')return <PartyNotesWorkspace direction={report==='debit-note-register'?'DEBIT':'CREDIT'} register/>;const kind=kinds[report];if(!kind)notFound();return <Suspense fallback={<p className="p-6">Loading report…</p>}><PartyReportsPage key={kind} kind={kind}/></Suspense>;}
