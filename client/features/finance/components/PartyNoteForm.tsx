"use client";
import {useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import ModalFame from '@/components/modals/ModalFame';
import {Field,inputCls} from '@/components/forms/FormField';
import {Button} from '@/components/ui/button';
import {DataTable,type Column} from '@/components/ui/table-components/DataTable';
import {WorkshopPicker,type PickerRecord} from '@/features/job-cards/components/WorkshopPicker';
import {creditKeys} from '@/features/credit/api/credit.keys';
import {amountCents} from './party-adjustment-workspace';
import {createPartyNote,getNoteCustomer,getNoteReceipts,type NoteDirection,type NoteInput,type NoteReceipt} from '../api/party-note.api';
const currency=(value:number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(value);
export const noteToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const noteDate=(value:string)=>new Intl.DateTimeFormat('en-NG',{timeZone:'Africa/Lagos'}).format(new Date(value));
export const noteError=(error:unknown)=> (error as {response?:{data?:{message?:string}}}).response?.data?.message??'The operation could not be completed. Check your connection and retry.';
type AccountLine={key:string;ledgerId:string;ledger?:PickerRecord;narration:string;value:string};
type ReceiptLine={receipt:NoteReceipt;value:string};
export function PartyNoteForm({direction,branchId,onClose,onSaved}:{direction:NoteDirection;branchId:string;onClose:()=>void;onSaved:()=>void}){
 const [customerId,setCustomerId]=useState(''),[order,setOrder]=useState('name'),[type,setType]=useState<'RECEIPT'|'AMOUNT'>('AMOUNT');
 const [date,setDate]=useState(noteToday),[narration,setNarration]=useState(''),[amount,setAmount]=useState('');
 const [accountLines,setAccountLines]=useState<AccountLine[]>([{key:crypto.randomUUID(),ledgerId:'',narration:'',value:''}]);
 const [selected,setSelected]=useState<Record<string,ReceiptLine>>({}),[page,setPage]=useState(1),[search,setSearch]=useState(''),[appliedSearch,setAppliedSearch]=useState('');
 const request=useRef<{fingerprint:string;key:string}|null>(null),client=useQueryClient();
 const customer=useQuery({queryKey:['note-customer',customerId],queryFn:()=>getNoteCustomer(customerId),enabled:!!customerId});
 const receipts=useQuery({queryKey:['note-receipts',customerId,branchId,page,appliedSearch],queryFn:()=>getNoteReceipts(customerId,branchId,page,appliedSearch),enabled:!!customerId&&direction==='DEBIT'&&type==='RECEIPT'});
 const selectedLines=Object.values(selected);
 const cents=amountCents(amount),lineTotal=direction==='CREDIT'?accountLines.reduce((s,l)=>s+(amountCents(l.value)??0),0):selectedLines.reduce((s,l)=>s+(amountCents(l.value)??0),0);
 const total=direction==='DEBIT'&&type==='RECEIPT'?lineTotal:cents??0;
 const invalidLines=direction==='CREDIT'?accountLines.some(l=>!l.ledgerId||!(amountCents(l.value)??0)):type==='RECEIPT'&&(selectedLines.length===0||selectedLines.some(l=>!(amountCents(l.value)??0)||(amountCents(l.value)??0)>Math.round(l.receipt.amount*100)));
 const valid=!!customerId&&!!date&&date<=noteToday()&&!!narration.trim()&&total>0&&total<=1e14&&selectedLines.length<=200&&!invalidLines&&(direction==='DEBIT'||lineTotal===cents)&&!customer.isLoading&&!customer.isError&&customer.data?.customer.branchId===branchId&&!(type==='RECEIPT'&&receipts.isError);
 const mutation=useMutation({mutationFn:createPartyNote,onSuccess:async()=>{
  toast.success(direction==='DEBIT'?'Debit note saved':'Credit note saved');
  await Promise.all([client.invalidateQueries({queryKey:['party-notes']}),client.invalidateQueries({queryKey:['party-account',customerId]}),client.invalidateQueries({queryKey:creditKeys.customer(customerId)}),client.invalidateQueries({queryKey:['party-report']}),client.invalidateQueries({queryKey:['customers']}),client.invalidateQueries({queryKey:['tally-documents']})]);onSaved();onClose();
 },onError:(e:unknown)=>toast.error(noteError(e))});
 const busy=mutation.isPending;
 function submit(){
  if(!valid||busy)return;
  const common={customerId,branchId,date,narration:narration.trim(),amount:total/100};
  const payload=direction==='DEBIT'?{...common,direction,type,receiptLines:type==='RECEIPT'?selectedLines.map(l=>({receiptId:l.receipt.id,amount:amountCents(l.value)!/100})):[]}:{...common,direction,type:'AMOUNT' as const,accountLines:accountLines.map(l=>({ledgerId:l.ledgerId,narration:l.narration.trim(),amount:amountCents(l.value)!/100}))};
  const fingerprint=JSON.stringify(payload);if(request.current?.fingerprint!==fingerprint)request.current={fingerprint,key:crypto.randomUUID()};
  mutation.mutate({...payload,idempotencyKey:request.current.key} as NoteInput);
 }
 const receiptColumns:Column<NoteReceipt>[]=[
  {header:'Receipt',render:r=><span>{r.receiptNumber}<span className="block text-xs text-muted-foreground">{noteDate(r.issuedAt)}</span></span>},
  {header:'Cheque',render:r=>r.chequeNumber??'—'},
  {header:'Receipt amount',render:r=>currency(r.amount)},
  {header:'Narration',render:r=>r.notes??'—'},
  {header:'Debit amount',render:r=><input aria-label={'Debit amount against '+r.receiptNumber} disabled={busy} inputMode="decimal" className={inputCls+' min-w-32'} value={selected[r.id]?.value??''} onChange={e=>setSelected(current=>{const next={...current};if(e.target.value)next[r.id]={receipt:r,value:e.target.value};else delete next[r.id];return next;})}/>},
 ];
 return <ModalFame isOpen onClose={()=>{if(!busy)onClose();}} title={direction==='DEBIT'?'New debit note':'New credit note'} description="The note number is assigned when saved."><form className="grid gap-4" onSubmit={e=>{e.preventDefault();submit();}}>
 <fieldset disabled={busy} className="grid gap-4">
 <div className="grid gap-4 sm:grid-cols-2"><Field label="Note date"><input className={inputCls} type="date" required max={noteToday()} value={date} onChange={e=>setDate(e.target.value)}/></Field><Field label="Party order"><select className={inputCls} value={order} onChange={e=>setOrder(e.target.value)}><option value="name">Name-wise</option><option value="code">Code-wise</option></select></Field></div>
 <WorkshopPicker label="Customer" required endpoint={'/finance/party-notes/parties?branchId='+branchId+'&order='+order} collection="customers" value={customerId} onChange={id=>{setCustomerId(id);setSelected({});setPage(1);}} formatLabel={r=>[r.code,r.name].filter(Boolean).join(' · ')}/>
 {customer.isLoading&&<p className="text-sm text-muted-foreground">Loading party details…</p>}{customer.isError&&<p role="alert" className="text-sm text-destructive">Could not load the party. <button type="button" onClick={()=>customer.refetch()}>Retry</button></p>}
 {customer.data&&<div className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">{customer.data.customer.code??'No customer code'}</p><p>{[customer.data.customer.house,customer.data.customer.street,customer.data.customer.address,customer.data.customer.city,customer.data.customer.state].filter(Boolean).join(', ')||'No address recorded'}</p></div>}
 {direction==='DEBIT'&&<Field label="Debit type"><select className={inputCls} value={type} onChange={e=>{setType(e.target.value as typeof type);setSelected({});}}><option value="AMOUNT">Amount — plain debit</option><option value="RECEIPT">Receipt — bounced cheque or receipt correction</option></select></Field>}
 <Field label="Narration"><textarea required maxLength={2000} className={inputCls+' h-20 py-2'} value={narration} onChange={e=>setNarration(e.target.value)}/></Field>
 {(direction==='CREDIT'||type==='AMOUNT')&&<Field label={direction==='CREDIT'?'Credit amount (NGN)':'Debit amount (NGN)'} error={amount&&(!cents||cents<=0)?'Enter a positive amount with at most two decimal places.':undefined}><input required inputMode="decimal" className={inputCls} value={amount} onChange={e=>setAmount(e.target.value)}/></Field>}
 {direction==='CREDIT'&&<section className="grid gap-3" aria-label="Credit account lines"><h3 className="font-semibold">Account lines</h3>{accountLines.map((l,index)=><div key={l.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"><WorkshopPicker label={'Account '+(index+1)} endpoint="/finance/party-notes/ledgers" collection="ledgers" value={l.ledgerId} selectedRecord={l.ledger} onChange={id=>setAccountLines(rows=>rows.map(row=>row.key===l.key?{...row,ledgerId:id}:row))} onSelect={ledger=>setAccountLines(rows=>rows.map(row=>row.key===l.key?{...row,ledgerId:ledger.id,ledger}:row))} formatLabel={r=>[r.code,r.name].join(' · ')}/><Field label="Line amount (NGN)" error={l.value&&!(amountCents(l.value)??0)?'Enter a positive amount with at most two decimal places.':undefined}><input inputMode="decimal" required className={inputCls} value={l.value} onChange={e=>setAccountLines(rows=>rows.map(row=>row.key===l.key?{...row,value:e.target.value}:row))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(accountLines.length<200)setAccountLines(rows=>[...rows,{key:crypto.randomUUID(),ledgerId:'',narration:'',value:''}]);}}}/></Field><Field label="Line narration"><input maxLength={1000} className={inputCls} value={l.narration} onChange={e=>setAccountLines(rows=>rows.map(row=>row.key===l.key?{...row,narration:e.target.value}:row))}/></Field><div className="flex items-end"><Button type="button" variant="outline" disabled={accountLines.length===1} onClick={()=>setAccountLines(rows=>rows.filter(row=>row.key!==l.key))}>Remove line</Button></div></div>)}<Button type="button" variant="outline" disabled={accountLines.length>=200} onClick={()=>setAccountLines(rows=>[...rows,{key:crypto.randomUUID(),ledgerId:'',narration:'',value:''}])}>Add account line</Button></section>}
 {direction==='DEBIT'&&type==='RECEIPT'&&<section className="grid gap-3"><h3 className="font-semibold">Active receipts</h3><p className="text-sm text-muted-foreground">Enter a debit against each required receipt, up to its full amount. The receipt and the bills it paid remain unchanged.</p><Field label="Find receipt or cheque"><div className="flex gap-2"><input className={inputCls} value={search} onChange={e=>setSearch(e.target.value)}/><Button type="button" variant="outline" onClick={()=>{setAppliedSearch(search);setPage(1);}}>Search</Button></div></Field>{receipts.isError?<p role="alert" className="text-sm text-destructive">Could not load receipts. <button type="button" onClick={()=>receipts.refetch()}>Retry</button></p>:<DataTable columns={receiptColumns} data={receipts.data?.receipts??[]} isLoading={receipts.isLoading} rowKey={r=>r.id}/>}<div className="flex items-center justify-between"><Button type="button" variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">{selectedLines.length} selected · Page {page} of {Math.max(1,receipts.data?.meta.totalPages??1)}</span><Button type="button" variant="outline" disabled={page>=(receipts.data?.meta.totalPages??0)} onClick={()=>setPage(p=>p+1)}>Next</Button></div>{selectedLines.map(l=><p key={l.receipt.id} className="flex justify-between gap-2 text-sm"><span>{l.receipt.receiptNumber}: {l.value||'0'} NGN</span><button type="button" className="text-primary underline" onClick={()=>setSelected(current=>{const next={...current};delete next[l.receipt.id];return next;})}>Remove</button></p>)}{invalidLines&&selectedLines.length>0&&<p role="alert" className="text-sm text-destructive">Each debit must be positive and no greater than its receipt amount.</p>}</section>}
 </fieldset>
 {mutation.isError&&<p role="alert" className="text-sm text-destructive">{noteError(mutation.error)}</p>}
 <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3"><div className="text-sm"><p className="font-semibold">Note total {currency(total/100)}</p>{direction==='CREDIT'&&<p className={lineTotal===cents?'text-muted-foreground':'text-destructive'}>Account lines {currency(lineTotal/100)} · Difference {currency(((cents??0)-lineTotal)/100)}</p>}</div><div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid||busy}>{busy?'Saving…':'Save note'}</Button></div></footer>
 </form></ModalFame>;
}
