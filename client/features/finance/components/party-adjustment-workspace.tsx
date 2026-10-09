"use client";
import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, inputCls } from '@/components/forms/FormField';
import { DataTable, type Column } from '@/components/ui/table-components/DataTable';
import { PageHeader } from '@/components/headers/page-header';
import ModalFame from '@/components/modals/ModalFame';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useBranchStore } from '@/store/branch.store';
import { getPartyDocuments, getAdjustmentBatches, previewFifo, type PartyDocument, type AdjustmentSelection, type FifoPreview } from '../api/party-account.api';
import { partyAccountKeys, usePartyAccount, usePartyMutations } from '../hooks/use-party-account';

const currency = new Intl.NumberFormat('en-NG',{ style: 'currency', currency: 'NGN' });
const keyFor = (document: PartyDocument) => document.kind+':'+document.id;
type Selected = Record<string,{ document: PartyDocument; value: string }>;
export function amountCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole,fraction=''] = value.split('.');
  const cents = Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents) && cents <= 1e14 ? cents : null;
}
const totalCents = (selected: Selected) => Object.values(selected).reduce((sum,line) => sum+(amountCents(line.value) ?? 0),0);
const selections = (selected: Selected): AdjustmentSelection[] => Object.values(selected).filter(line => (amountCents(line.value) ?? 0) > 0).map(line => ({ id: line.document.id,kind: line.document.kind,amount: (amountCents(line.value) ?? 0)/100 }));

export function PartyAdjustmentWorkspace({ initialCustomerId = '' }: { initialCustomerId?: string }) {
  const [customerId,setCustomerId] = useState(initialCustomerId);
  const [order,setOrder] = useState<'name'|'code'>('name');
  const branchId = useBranchStore(state=>state.activeBranch?.id);
  const party = usePartyAccount(customerId,branchId);
  return <div className="flex flex-col gap-5 p-4 lg:p-6">
    <PageHeader title="Advance adjustment" description="Apply available receipts and credits to bills and opening debits." />
    <section className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-[180px_minmax(0,1fr)]" aria-label="Party selection">
      <Field label="Party order"><select className={inputCls} value={order} onChange={event=>setOrder(event.target.value as typeof order)}><option value="name">Name-wise</option><option value="code">Code-wise</option></select></Field>
      <WorkshopPicker label="Party" endpoint={'/finance/parties?order='+order+(branchId ? '&branchId='+branchId : '')} selectedRecord={party.data ? { id: customerId, name: party.data.customer.name, code: party.data.customer.code } : undefined} collection="customers" value={customerId} onChange={setCustomerId} formatLabel={row=>order==='code' ? [row.code,row.name || row.companyName || [row.firstName,row.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : row.companyName || [row.firstName,row.lastName].filter(Boolean).join(' ')} />
    </section>
    {!branchId ? <p role="alert" className="text-sm text-destructive">Select a branch in the app header to adjust its documents.</p> : !customerId ? <p className="py-10 text-center text-sm text-muted-foreground">Select a party to review debit and credit balances.</p> : <AdjustmentSession key={customerId+branchId} customerId={customerId} branchId={branchId} />}
  </div>;
}

function AdjustmentSession({ customerId,branchId }: { customerId: string; branchId: string }) {
  const { user,hasPermission } = useAuth();
  const account = usePartyAccount(customerId,branchId);
  const { save,reverse } = usePartyMutations(customerId);
  const [debits,setDebits] = useState<Selected>({});
  const [credits,setCredits] = useState<Selected>({});
  const [debitPage,setDebitPage] = useState(1);
  const [creditPage,setCreditPage] = useState(1);
  const [openDebits,setOpenDebits] = useState(true);
  const [openCredits,setOpenCredits] = useState(true);
  const [fifo,setFifo] = useState<FifoPreview | null>(null);
  const effectiveDate = useRef<string | null>(null);
  const [requestKey,setRequestKey] = useState(()=>crypto.randomUUID());
  const [reversing,setReversing] = useState<string | null>(null);
  const [remark,setRemark] = useState('');
  const debitQuery = useQuery({ queryKey: [...partyAccountKeys.customer(customerId),'documents',branchId,'DEBIT',openDebits,debitPage], queryFn: ()=>getPartyDocuments(customerId,branchId,'DEBIT',openDebits,debitPage) });
  const creditQuery = useQuery({ queryKey: [...partyAccountKeys.customer(customerId),'documents',branchId,'CREDIT',openCredits,creditPage], queryFn: ()=>getPartyDocuments(customerId,branchId,'CREDIT',openCredits,creditPage) });
  const batches = useQuery({ queryKey: [...partyAccountKeys.customer(customerId),'batches',branchId], queryFn: ()=>getAdjustmentBatches(customerId,branchId) });
  const fifoMutation = useMutation({ mutationFn: ()=>previewFifo(customerId,branchId), onSuccess: preview=>{
    const selected = (lines: AdjustmentSelection[],documents: PartyDocument[]) => Object.fromEntries(lines.map(line=>{ const document=documents.find(row=>row.id===line.id&&row.kind===line.kind)!; return [keyFor(document),{ document,value: String(line.amount) }]; }));
    setFifo(preview);setDebits(selected(preview.debits,preview.debitDocuments));setCredits(selected(preview.credits,preview.creditDocuments));
    if (!preview.amount) toast.info('No outstanding debits and available credits can be matched');
  }, onError: (error: unknown)=>toast.error((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'FIFO preview could not be loaded') });
  const debitTotal = totalCents(debits);
  const creditTotal = totalCents(credits);
  const invalid = [...Object.values(debits),...Object.values(credits)].some(line=>{ const cents=amountCents(line.value); return cents===null||cents<=0||cents>Math.round(line.document.balance*100); });
  const busy = save.isPending || reverse.isPending || fifoMutation.isPending;
  const blocked = account.isLoading || account.isError || busy || invalid || debitTotal<=0 || debitTotal>1e14 || creditTotal>1e14 || debitTotal!==creditTotal || Object.keys(debits).length>200 || Object.keys(credits).length>200 || debitQuery.isError || creditQuery.isError || debitQuery.isFetching || creditQuery.isFetching;
  const reset = () => { setDebits({});setCredits({});setFifo(null);setRequestKey(crypto.randomUUID());effectiveDate.current=null; };
  const canReverse = (user?.role==='Admin'||user?.role==='SuperAdmin') && hasPermission('receipt:adjust:reverse');
  return <div className="grid gap-5">
    {account.isLoading ? <p role="status">Loading account...</p> : account.isError ? <p role="alert" className="text-sm text-destructive">Account could not be loaded. <button onClick={()=>account.refetch()} className="underline">Retry</button></p> : account.data && <section className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-3" aria-label="Account balances"><div><p className="text-sm text-muted-foreground">{account.data.customer.code} · {account.data.customer.name}</p><p className="mt-1 font-semibold">Outstanding {currency.format(account.data.outstanding)}</p></div><div><p className="text-sm text-muted-foreground">Unadjusted credits</p><p className="mt-1 font-semibold">{currency.format(account.data.availableCredit)}</p></div><div><p className="text-sm text-muted-foreground">Net balance</p><p className="mt-1 font-semibold">{currency.format(account.data.netOutstanding)}</p></div></section>}
    <div className="flex flex-wrap items-center gap-4 text-sm"><label className="flex items-center gap-2"><Checkbox checked={openDebits} disabled={busy} onCheckedChange={value=>{setOpenDebits(!!value);setDebitPage(1);}} />Outstanding bills only</label><label className="flex items-center gap-2"><Checkbox checked={openCredits} disabled={busy} onCheckedChange={value=>{setOpenCredits(!!value);setCreditPage(1);}} />Advance credits only</label><label className="flex items-center gap-2"><Checkbox checked={!!fifo} disabled={busy} onCheckedChange={value=>{if(value)fifoMutation.mutate();else reset();}} />FIFO</label><Button size="sm" variant="outline" disabled={busy} onClick={()=>{reset();void account.refetch();void debitQuery.refetch();void creditQuery.refetch();void batches.refetch();}}>Refresh balances</Button></div>
    {fifoMutation.isPending && <p role="status" className="text-sm">Matching oldest credits and debits...</p>}
    {fifo && <p className="text-sm text-muted-foreground">FIFO uses up to 200 oldest documents per side. You can edit the amounts below. Save and repeat to match any remaining documents.</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <AdjustmentGrid title="Debits" documents={fifo?.debitDocuments ?? debitQuery.data?.documents ?? []} selected={debits} onChange={setDebits} disabled={busy} loading={debitQuery.isLoading} error={debitQuery.isError} retry={()=>debitQuery.refetch()} page={debitPage} setPage={setDebitPage} meta={fifo ? undefined : debitQuery.data?.meta} />
      <AdjustmentGrid title="Credits" documents={fifo?.creditDocuments ?? creditQuery.data?.documents ?? []} selected={credits} onChange={setCredits} disabled={busy} loading={creditQuery.isLoading} error={creditQuery.isError} retry={()=>creditQuery.refetch()} page={creditPage} setPage={setCreditPage} meta={fifo ? undefined : creditQuery.data?.meta} />
    </div>
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-background p-4 shadow-sm" aria-live="polite"><div className="flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>Debit adjusted <strong>{currency.format(debitTotal/100)}</strong></span><span>Credit adjusted <strong>{currency.format(creditTotal/100)}</strong></span><span className={debitTotal!==creditTotal?'text-destructive':''}>Difference <strong>{currency.format((debitTotal-creditTotal)/100)}</strong></span>{(debitTotal>1e14 || creditTotal>1e14) && <span role="alert" className="text-destructive">A batch may adjust up to NGN 1,000,000,000,000.</span>}{invalid && <span role="alert" className="text-destructive">Enter positive amounts within each document balance, with at most two decimal places.</span>}</div><Button disabled={blocked} onClick={()=>save.mutate({ customerId,branchId,date: effectiveDate.current ?? (effectiveDate.current = new Date().toISOString()),source: fifo?'FIFO':'ADVANCE_ADJUSTMENT',idempotencyKey: requestKey,debits: selections(debits),credits: selections(credits) },{ onSuccess: reset })}>{save.isPending?'Saving...':'Save adjustment'}</Button></div>
    <section className="grid gap-3"><h2 className="font-semibold">Recent adjustments</h2>{batches.isError ? <p role="alert" className="text-sm text-destructive">History could not be loaded. <button onClick={()=>batches.refetch()} className="underline">Retry</button></p> : <DataTable data={batches.data ?? []} rowKey={batch=>batch.id} isLoading={batches.isLoading} emptyMessage="No adjustment batches yet." columns={[
      { header: 'Date',render: batch=>new Date(batch.date).toLocaleDateString('en-NG') },{ header: 'Source',render: batch=>batch.source.replaceAll('_',' ') },{ header: 'Amount',render: batch=>currency.format(Number(batch.amount)) },{ header: 'Status',render: batch=>batch.reversedAt?'Reversed':'Active' },{ header: 'Action',render: batch=>canReverse&&!batch.reversedAt?<Button size="sm" variant="outline" disabled={busy||!!batch.tallyPostedAt} onClick={()=>{setRemark('');setReversing(batch.id);}}>Reverse</Button>:batch.reverseRemark ?? '—' },
    ]} />}</section>
    <ModalFame isOpen={!!reversing} onClose={()=>{if(!reverse.isPending)setReversing(null);}} title="Reverse adjustment"><form className="grid gap-4" onSubmit={event=>{event.preventDefault();if(reversing&&remark.trim())reverse.mutate({ id: reversing,remark: remark.trim() },{ onSuccess: ()=>{setReversing(null);reset();} });}}><p className="text-sm text-muted-foreground">This returns the adjusted amounts to the original documents. Tally-exported or posted documents prevent reversal.</p><Field label="Reason for reversal"><textarea required maxLength={1000} className={inputCls+' h-24 py-2'} value={remark} disabled={reverse.isPending} onChange={event=>setRemark(event.target.value)} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={reverse.isPending} onClick={()=>setReversing(null)}>Cancel</Button><Button type="submit" disabled={reverse.isPending||!remark.trim()}>{reverse.isPending?'Reversing...':'Confirm reversal'}</Button></div></form></ModalFame>
  </div>;
}

function AdjustmentGrid({ title,documents,selected,onChange,disabled,loading,error,retry,page,setPage,meta }: { title: string; documents: PartyDocument[]; selected: Selected; onChange: (selected: Selected)=>void; disabled: boolean; loading: boolean; error: boolean; retry: ()=>unknown; page: number; setPage: (page: number)=>void; meta?: { pageSize: number; total: number; totalPages: number } }) {
  const update = (document: PartyDocument,value: string) => onChange({ ...selected,[keyFor(document)]:{ document,value } });
  const columns: Column<PartyDocument>[] = [
    { header: 'Select',render: document=><Checkbox aria-label={'Select '+document.number} disabled={disabled||document.balance<=0} checked={!!selected[keyFor(document)]} onCheckedChange={value=>{if(value)update(document,String(document.balance));else {const next={...selected};delete next[keyFor(document)];onChange(next);}}} /> },
    { header: 'Document',render: document=><div><p className="font-medium">{document.number}</p><p className="text-xs text-muted-foreground">{document.kind} · {new Date(document.date).toLocaleDateString('en-NG')}</p></div> },
    { header: 'Total',render: document=>currency.format(document.amount) },
    { header: 'Adjusted',render: document=>{
      const line = selected[keyFor(document)];
      const cents = line ? amountCents(line.value) : null;
      const error = !!line && (cents === null || cents <= 0 || cents > Math.round(document.balance*100));
      return <div><input aria-label={'Adjusted amount for '+document.number} aria-invalid={error} aria-describedby={error ? keyFor(document)+'-error' : undefined} inputMode="decimal" className={inputCls+' min-w-28'} disabled={disabled||!line} value={line?.value ?? ''} onChange={event=>update(document,event.target.value)} />{error && <p id={keyFor(document)+'-error'} className="mt-1 text-xs text-destructive">Use 0.01 to {currency.format(document.balance)}, with at most two decimal places.</p>}</div>;
    } },
    { header: title==='Debits'?'Outstanding':'Available',render: document=>currency.format(document.balance) },
  ];
  return <section className="grid min-w-0 content-start gap-3" aria-label={title}><h2 className="font-semibold">{title}</h2>{error?<p role="alert" className="text-sm text-destructive">Balances could not be loaded. <button onClick={retry} className="underline">Retry</button></p>:<DataTable columns={columns} data={documents} rowKey={keyFor} isLoading={loading} emptyMessage={'No matching '+title.toLowerCase()+'.'} page={page} pageSize={meta?.pageSize} total={meta?.total} totalPages={meta?.totalPages} onPageChange={disabled?undefined:setPage} />}</section>;
}
