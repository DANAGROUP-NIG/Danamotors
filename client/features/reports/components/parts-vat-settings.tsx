"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useMutation,useQuery } from '@tanstack/react-query';
import { apiGet,apiPut } from '@/lib/api/apiClient';
import { PageHeader } from '@/components/headers/page-header';
import { Field,inputCls } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
type Settings={enabled:boolean;rates:{SPARES:number;OIL:number;ACCESSORIES:number}};
export function PartsVatSettings(){
 const query=useQuery({queryKey:['parts-vat-settings'],queryFn:()=>apiGet<Settings>('/reports/billing-settings')});const [draft,setDraft]=useState<Settings|null>(null);const current=draft??query.data;
 const save=useMutation({mutationFn:()=>apiPut<Settings>('/reports/billing-settings',current),onSuccess:()=>query.refetch()});
 return <div className="space-y-6 p-4 lg:p-8"><Link href="/reports" className="text-sm text-primary underline">All reports</Link><PageHeader title="Parts VAT settings" description="Applies to newly created bills. Existing invoices retain their stored amounts."/>
 {query.isLoading?<p>Loading settings…</p>:query.isError?<p role="alert">Settings unavailable. Admin or SuperAdmin access is required.</p>:current&&<form onSubmit={e=>{e.preventDefault();save.mutate();}} className="max-w-2xl space-y-5 rounded-2xl border bg-card p-6"><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Enable parts VAT only after business confirmation. Classify customer-paid parts in Part Master first. Unticking Taxable on a part makes it exempt (0%).</p><label className="flex items-center gap-3"><input type="checkbox" checked={current.enabled} onChange={e=>setDraft({...current,enabled:e.target.checked})}/>Enable parts VAT on new bills</label><div className="grid gap-4 sm:grid-cols-3">{(['SPARES','OIL','ACCESSORIES'] as const).map(k=><Field key={k} label={k+' VAT (%)'}><input type="number" className={inputCls} min={0} max={100} step="0.01" required value={current.rates[k]} onChange={e=>setDraft({...current,rates:{...current.rates,[k]:Number(e.target.value)}})}/></Field>)}</div><Button disabled={save.isPending}>Save settings</Button>{save.isSuccess&&<p role="status" className="text-sm">Settings saved.</p>}{save.isError&&<p role="alert" className="text-sm text-destructive">{save.error.message}</p>}</form>}</div>;
}
