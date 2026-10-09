"use client";
import Link from 'next/link';
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { usePartyAccount } from '@/features/finance/hooks/use-party-account';
import { OpeningBalanceModal } from '@/features/finance/components/OpeningBalanceModal';
import type { Customer } from '../types/customer.types';

const currency = new Intl.NumberFormat('en-NG',{ style: 'currency',currency: 'NGN' });
export function CustomerCreditCard({ customer }: { customer: Customer }) {
  const account = usePartyAccount(customer.id,customer.branchId);
  const { user,hasPermission } = useAuth();
  const [opening,setOpening] = useState(false);
  const canOpen = (user?.role==='Admin'||user?.role==='SuperAdmin')&&hasPermission('party:opening:create');
  return <section className="grid gap-5 rounded-xl border bg-background p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Wallet className="size-4" />Party account</h2><div className="flex flex-wrap gap-2">{hasPermission('report:party-ledger')&&<Button asChild variant="outline" size="sm"><Link href={'/reports/finance/party-ledger?customerId='+customer.id+'&branchId='+customer.branchId}>View ledger</Link></Button>}{hasPermission('receipt:adjust')&&<Button asChild size="sm"><Link href={'/finance/receipts/advance-adjustment?customerId='+customer.id}>Adjust balances</Link></Button>}{canOpen&&<Button variant="outline" size="sm" onClick={()=>setOpening(true)}>Record opening balance</Button>}</div></div>
    <p className="text-sm font-medium">{customer.companyName || [customer.firstName,customer.lastName].filter(Boolean).join(' ')}</p>
    {account.isLoading?<div aria-busy="true" className="h-20 animate-pulse rounded-md bg-muted" />:account.isError?<div role="alert"><p className="text-sm text-destructive">Account could not be loaded.</p><Button variant="outline" size="sm" onClick={()=>account.refetch()}>Retry</Button></div>:account.data&&<dl className="grid gap-4 sm:grid-cols-3"><div><dt className="text-sm text-muted-foreground">Outstanding debits</dt><dd className="mt-1 text-xl font-semibold">{currency.format(account.data.outstanding)}</dd></div><div><dt className="text-sm text-muted-foreground">Unadjusted credits</dt><dd className="mt-1 text-xl font-semibold">{currency.format(account.data.availableCredit)}</dd></div><div><dt className="text-sm text-muted-foreground">Net outstanding</dt><dd className="mt-1 text-xl font-semibold">{currency.format(account.data.netOutstanding)}</dd></div></dl>}
    <p className="text-sm text-muted-foreground">Available credit includes receipt advances, credit notes, and opening credits.</p>
    {opening&&<OpeningBalanceModal customerId={customer.id} branchId={customer.branchId} onClose={()=>setOpening(false)} />}
  </section>;
}
