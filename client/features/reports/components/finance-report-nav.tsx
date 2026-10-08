
"use client";
import Link from 'next/link';
import { useAuth } from '@/features/auth/hooks/use-auth';
export const PARTY_REPORTS=[
 {kind:'ledger' as const,title:'Party Ledger',slug:'party-ledger',permission:'report:party-ledger'},
 {kind:'outstanding' as const,title:'Party Outstanding',slug:'party-outstanding',permission:'report:party-outstanding'},
 {kind:'age' as const,title:'Age-wise Outstanding',slug:'party-outstanding-age',permission:'report:party-outstanding-age'},
 {kind:'bill' as const,title:'Bill-wise Outstanding',slug:'party-outstanding-bill',permission:'report:party-outstanding-bill'},
];
export function FinanceReportNav(){const {hasPermission}=useAuth();return <nav aria-label="Finance reports" className="flex flex-wrap gap-2 border-b pb-3">{hasPermission('report:receipt-register')&&<Link className="rounded-md border px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2" href="/reports">Receipt Register</Link>}{PARTY_REPORTS.filter(r=>hasPermission(r.permission)).map(r=><Link className="rounded-md border px-3 py-2 text-sm hover:bg-muted focus-visible:ring-2" key={r.kind} href={'/reports/finance/'+r.slug}>{r.title}</Link>)}</nav>;}
