"use client";
import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import Link from 'next/link';
import {PageHeader} from '@/components/headers/page-header';
import {Field,inputCls} from '@/components/forms/FormField';
import {Button} from '@/components/ui/button';
import {DataTable,type Column} from '@/components/ui/table-components/DataTable';
import ModalFame from '@/components/modals/ModalFame';
import {creditKeys} from '@/features/credit/api/credit.keys';
import {useAuth} from '@/features/auth/hooks/use-auth';
import {useBranchStore} from '@/store/branch.store';
import {FinanceReportNav} from '@/features/reports/components/finance-report-nav';
import {exportReportFile,printReportFile} from '@/features/reports/api/party-report.api';
import {getNoteRegister,cancelPartyNote,noteQuery,type NoteDirection,type NoteFilters,type PartyNote} from '../api/party-note.api';
import {PartyNoteForm,noteDate,noteToday,noteError} from './PartyNoteForm';
const cash=(value:string|number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(value));
export function PartyNotesWorkspace({direction,register=false}:{direction:NoteDirection;register?:boolean}){
 const branchId=useBranchStore(s=>s.activeBranch?.id);return <NoteSession key={direction+branchId+register} direction={direction} register={register} branchId={branchId}/>;
}
function NoteSession({direction,register,branchId}:{direction:NoteDirection;register:boolean;branchId?:string}){
 const {hasPermission,user}=useAuth(),client=useQueryClient(),title=direction==='DEBIT'?'Debit notes':'Credit notes';
 const prefix=direction==='DEBIT'?'debitnote':'creditnote',canRead=hasPermission(prefix+':read'),canCreate=hasPermission(prefix+':create'),canCancel=hasPermission(prefix+':cancel');
 const [from,setFrom]=useState(noteToday().slice(0,4)+'-01-01'),[to,setTo]=useState(noteToday),[allBranches,setAllBranches]=useState(false);
 const [filters,setFilters]=useState<NoteFilters>({direction,from,to,branchId,page:1,pageSize:25});
 const [formOpen,setFormOpen]=useState(false),[detail,setDetail]=useState<PartyNote|null>(null),[cancelling,setCancelling]=useState(false),[remark,setRemark]=useState(''),[outputBusy,setOutputBusy]=useState(false);
 const admin=user?.role==='Admin'||user?.role==='SuperAdmin';
 const result=useQuery({queryKey:['party-notes',register,filters],queryFn:({signal})=>getNoteRegister(filters,register,signal),enabled:!!branchId||admin,staleTime:30000});
 const changed=from!==filters.from||to!==filters.to||(allBranches?undefined:branchId)!==filters.branchId;
 const cancel=useMutation({mutationFn:()=>cancelPartyNote(detail!.id,remark.trim()),onSuccess:async response=>{toast.success('Note cancelled');setDetail(response.note);setCancelling(false);setRemark('');await Promise.all([client.invalidateQueries({queryKey:['party-notes']}),client.invalidateQueries({queryKey:['party-account',detail!.customer.id]}),client.invalidateQueries({queryKey:creditKeys.customer(detail!.customer.id)}),client.invalidateQueries({queryKey:['party-report']}),client.invalidateQueries({queryKey:['customers']}),client.invalidateQueries({queryKey:['tally-batches']}),client.invalidateQueries({queryKey:['tally-documents']})]);},onError:(e:unknown)=>toast.error(noteError(e))});
 async function output(kind:'print'|'export'){
  const target=kind==='print'?window.open('','_blank'):null;if(kind==='print'&&!target){toast.error('Allow the report window to print');return;}
  setOutputBusy(true);try{const query=noteQuery(filters);if(kind==='print')await printReportFile('/finance/party-notes/register/print?'+query,target!);else await exportReportFile('/finance/party-notes/register/export?'+query,'dana-'+direction.toLowerCase()+'-note-register.xml','/finance/party-notes/register?'+query);}
  catch(e){if((e as {name?:string}).name!=='AbortError')toast.error(e instanceof Error?e.message:noteError(e));target?.close();}finally{setOutputBusy(false);}
 }
 async function printNote(){
  const target=window.open('','_blank');if(!target){toast.error('Allow the note window to print');return;}setOutputBusy(true);
  try{await printReportFile('/finance/party-notes/'+detail!.id+'/print',target);}catch(e){toast.error(noteError(e));}finally{setOutputBusy(false);}
 }
 const cols:Column<PartyNote>[]=[
 {header:'Note',render:n=>canRead?<button className="text-primary underline" onClick={()=>{setDetail(n);setCancelling(false);setRemark('');}}>{n.number}</button>:n.number},
 {header:'Date',render:n=>noteDate(n.date)},
 ...(direction==='DEBIT'?[{header:'Type',render:(n:PartyNote)=>n.type}]:[]),
 {header:'Customer code',render:n=>n.partyCode??n.customer.code??'—'},
 {header:'Customer',render:n=>n.partyName??n.customer.companyName??n.customer.firstName+' '+n.customer.lastName},
 {header:'Narration',render:n=>n.narration},
 {header:direction==='DEBIT'?'Linked receipts':'Account lines',render:n=><span className="block max-w-80 whitespace-normal">{direction==='DEBIT'?n.receiptLines.map(l=>l.receiptNumber+' ('+cash(l.amount)+')').join('; ')||'—':n.accountLines.map(l=>l.accountCode+' '+l.accountName+' ('+cash(l.amount)+')').join('; ')}</span>},
 {header:'Amount',render:n=>cash(n.amount)},
 {header:direction==='DEBIT'?'Outstanding':'Unadjusted',render:n=>cash(n.remainingAmount)},
 {header:'Status',render:n=>n.status},
 {header:'Tally voucher',render:n=>n.tallyVoucherNo??'—'},
 ];
 return <div className="flex flex-col gap-5 p-4 lg:p-6"><PageHeader title={register?title.replace('notes','note register'):title} description={register?'Review every note in the date range, with all-page totals, print and Excel output.':'Record a debit or credit, review its details, and cancel eligible notes.'}/>
 {register?<FinanceReportNav/>:<div className="flex flex-wrap gap-3"><Link className="text-sm text-primary underline" href="/finance">Finance</Link>{canCreate&&<Button disabled={!branchId} onClick={()=>setFormOpen(true)}>New {direction==='DEBIT'?'debit':'credit'} note</Button>}{hasPermission('report:'+(direction==='DEBIT'?'debit':'credit')+'-note-register')&&<Link className="text-sm text-primary underline" href={'/reports/finance/'+direction.toLowerCase()+'-note-register'}>Open register</Link>}</div>}
 <form className="grid gap-4 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();if(from&&to&&from<=to){const next={direction,from,to,branchId:allBranches?undefined:branchId,page:1,pageSize:25};setFilters(next);if(noteQuery(next)===noteQuery(filters))void result.refetch();}}}>
 <Field label="From date"><input className={inputCls} type="date" required value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="To date" error={from>to?'End date must be on or after start date':undefined}><input className={inputCls} type="date" required min={from} value={to} onChange={e=>setTo(e.target.value)}/></Field><Field label="Branch"><select className={inputCls} value={allBranches?'all':'selected'} onChange={e=>setAllBranches(e.target.value==='all')}><option value="selected">{branchId?'Current branch':'Select a branch in the app header'}</option>{admin&&<option value="all">All branches</option>}</select></Field><div className="flex items-end gap-2"><Button type="submit" disabled={!from||!to||from>to||(!branchId&&!allBranches)}>Run report</Button></div>
 </form>
 {changed&&<p className="text-sm text-muted-foreground">Filters changed. Run the report to update results.</p>}
 {register&&<div className="flex gap-2"><Button variant="outline" disabled={changed||result.isFetching||result.isError||outputBusy} onClick={()=>output('print')}>Print all results</Button><Button variant="outline" disabled={changed||result.isFetching||result.isError||outputBusy} onClick={()=>output('export')}>Export Excel</Button></div>}
 {!branchId&&!admin?<p role="alert" className="text-sm text-destructive">Your account needs an assigned branch.</p>:result.isError?<div role="alert" className="text-sm text-destructive">{noteError(result.error)} <Button variant="outline" onClick={()=>result.refetch()}>Retry</Button></div>:<><DataTable columns={cols} data={result.data?.notes??[]} isLoading={result.isLoading} rowKey={n=>n.id}/><div className="flex flex-wrap justify-between gap-3 rounded-lg border bg-background p-3 text-sm"><span>Total amount {cash(result.data?.totals.amount??0)} · Remaining {cash(result.data?.totals.remaining??0)}</span><span>{result.data?.meta.total??0} notes · Totals include cancelled note face amounts</span></div><div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={filters.page<=1||result.isFetching} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>Previous</Button><p className="text-sm">Page {filters.page} of {Math.max(1,result.data?.meta.totalPages??1)}</p><Button variant="outline" disabled={filters.page>=(result.data?.meta.totalPages??0)||result.isFetching} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>Next</Button></div></>}
 {formOpen&&branchId&&<PartyNoteForm direction={direction} branchId={branchId} onClose={()=>setFormOpen(false)} onSaved={()=>result.refetch()}/>}
 {detail&&<ModalFame isOpen title={(direction==='DEBIT'?'Debit':'Credit')+' note '+detail.number} description={noteDate(detail.date)+' · '+detail.branch.name+' · '+detail.status} onClose={()=>{if(!cancel.isPending){setDetail(null);setCancelling(false);}}}><div className="grid gap-4"><div><p className="font-semibold">{detail.partyName??detail.customer.companyName??detail.customer.firstName+' '+detail.customer.lastName}</p><p className="text-sm text-muted-foreground">{[detail.partyCode,detail.partyAddress,detail.partyCity,detail.partyState].filter(Boolean).join(' · ')}</p></div><p className="whitespace-pre-wrap text-sm">{detail.narration}</p><p className="text-sm">Amount {cash(detail.amount)} · Remaining {cash(detail.remainingAmount)} · Tally {detail.tallyVoucherNo??'Not posted'}</p>{detail.receiptLines.map(l=><p key={l.id} className="text-sm">{l.receiptNumber} · {noteDate(l.receiptDate)} · Cheque {l.chequeNumber??'—'} · Receipt {cash(l.receiptAmount)} · Debit {cash(l.amount)}<span className="block text-muted-foreground">{l.narration}</span></p>)}{detail.accountLines.map(l=><p key={l.id} className="text-sm">{l.accountCode} · {l.accountName} · {cash(l.amount)}<span className="block text-muted-foreground">{l.narration}</span></p>)}{detail.cancelRemark&&<p className="text-sm text-destructive">Cancelled: {detail.cancelRemark}</p>}
 <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={outputBusy} onClick={printNote}>Print note</Button>{hasPermission('receipt:adjust')&&detail.status==='ACTIVE'&&<Link className="text-sm text-primary underline" href={'/finance/receipts/advance-adjustment?customerId='+detail.customer.id}>Adjust this party</Link>}{canCancel&&detail.status==='ACTIVE'&&!detail.tallyPostedAt&&Number(detail.amount)===Number(detail.remainingAmount)&&<Button variant="outline" disabled={cancel.isPending} onClick={()=>setCancelling(true)}>Cancel note</Button>}</div>
 {cancelling&&<div className="grid gap-3 border-t pt-3"><Field label="Cancellation remark"><textarea required maxLength={1000} className={inputCls+' h-20 py-2'} value={remark} disabled={cancel.isPending} onChange={e=>setRemark(e.target.value)}/></Field><p className="text-sm text-muted-foreground">Cancellation keeps the document and reverses its party balance. Confirm the remark to continue.</p>{cancel.isError&&<p role="alert" className="text-sm text-destructive">{noteError(cancel.error)}</p>}<div className="flex gap-2"><Button variant="outline" disabled={cancel.isPending} onClick={()=>setCancelling(false)}>Keep note</Button><Button disabled={!remark.trim()||cancel.isPending} onClick={()=>cancel.mutate()}>{cancel.isPending?'Cancelling…':'Confirm cancellation'}</Button></div></div>}
 </div></ModalFame>}
 </div>;
}
