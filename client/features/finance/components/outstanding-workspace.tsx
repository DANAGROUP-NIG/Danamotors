"use client";
import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {apiGet,apiPost,apiPut} from '@/lib/api/apiClient';
import {api} from '@/lib/api/axios';
import {useAuth} from '@/features/auth/hooks/use-auth';
import {useBranchStore} from '@/store/branch.store';
import {PageHeader} from '@/components/headers/page-header';
import {Field,inputCls} from '@/components/forms/FormField';
import {Button} from '@/components/ui/button';
import {DataTable} from '@/components/ui/table-components/DataTable';
import {WorkshopPicker} from '@/features/job-cards/components/WorkshopPicker';
import {noteToday,noteError} from './PartyNoteForm';
type Filters={branchId?:string;order:'name'|'code';partyStatus:'ALL'|'CUSTOMER'|'DEALER'|'FA_PARTY';fromCustomerId?:string;toCustomerId?:string};
type Settings={defaultCreditDays:number;letterPrefix:string;letterTemplate:string};
type PreviewParty={id:string;code:string|null;name:string;net:string;bills:number};
type Repair={id:string;kind:string;number:string;code:string|null;name:string;stored:string;expected:string;statusBefore:string;status:string};
type Letter={id:string;reference:string;totalOutstanding:string;asOn:string;printedAt:string|null;snapshot:{name:string;code:string|null}};
const cash=(v:string|number)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(v));
export function OutstandingWorkspace({repair=false}:{repair?:boolean}){
 const branchId=useBranchStore(s=>s.activeBranch?.id);return <OutstandingSession key={String(branchId)+repair} branchId={branchId} repair={repair}/>;
}
function OutstandingSession({branchId,repair}:{branchId?:string;repair:boolean}){
 const {user,hasPermission}=useAuth(),client=useQueryClient();
 const admin=user?.role==='Admin'||user?.role==='SuperAdmin';
 const [all,setAll]=useState(false),[order,setOrder]=useState<'name'|'code'>('name'),[partyStatus,setStatus]=useState<Filters['partyStatus']>('ALL');
 const [fromCustomerId,setFrom]=useState(''),[toCustomerId,setTo]=useState('');
 const [asOn,setAsOn]=useState(noteToday),[threshold,setThreshold]=useState('0'),[includePrinted,setIncludePrinted]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<{hash:string;signature:string;checked?:number;parties?:PreviewParty[];changes?:Repair[];wallets?:{id:string;code:string|null;name:string;stored:string;expected:string}[]}|null>(null);
 const [generated,setGenerated]=useState<Letter[]>([]),[requestKey,setRequestKey]=useState<string|null>(null);
 const [fromRef,setFromRef]=useState(''),[toRef,setToRef]=useState(''),[savedFilters,setSavedFilters]=useState({fromRef:'',toRef:'',page:1});
 const [selected,setSelected]=useState<string[]>([]),[printedConfirm,setPrintedConfirm]=useState(false);
 const filters:Filters={branchId:admin&&all?undefined:branchId,order,partyStatus,...(fromCustomerId?{fromCustomerId}:{}),...(toCustomerId?{toCustomerId}:{})};
 const body=repair?filters:{...filters,asOn,threshold:Number(threshold),includePrinted};
 const signature=JSON.stringify(body);
 const thresholdValid=threshold.trim()!==''&&Number.isFinite(Number(threshold))&&Number(threshold)>=0&&Number(threshold)<=999999999999&&Number(Number(threshold).toFixed(2))===Number(threshold);
 const fresh=preview?.signature===signature&&(repair||thresholdValid);
 const picker='/finance/outstanding-letters/parties?order='+order+(filters.branchId?'&branchId='+filters.branchId:'');
 const settings=useQuery({queryKey:['outstanding-settings'],queryFn:()=>apiGet<Settings>('/finance/settings/outstanding')});
 const [draft,setDraft]=useState<Settings|null>(null);
 const settingValues=draft??settings.data;
 const savedQuery=new URLSearchParams({page:String(savedFilters.page),...(filters.branchId?{branchId:filters.branchId}:{}),...(savedFilters.fromRef?{fromRef:savedFilters.fromRef}:{}),...(savedFilters.toRef?{toRef:savedFilters.toRef}:{})});
 const saved=useQuery({queryKey:['outstanding-letters',savedQuery.toString()],queryFn:()=>apiGet<{letters:Letter[];meta:{page:number;totalPages:number;total:number}}>('/finance/outstanding-letters?'+savedQuery),enabled:!repair&&(!!branchId||admin)});
 async function action(work:()=>Promise<void>){setBusy(true);setError('');try{await work();}catch(e){const message=noteError(e);setError(message);toast.error(message);}finally{setBusy(false);}}
 async function previewNow(){await action(async()=>{
  if(!repair&&!thresholdValid)throw new Error('Enter a nonnegative threshold with at most two decimal places');
  const response=await apiPost<{previewHash:string;checked?:number;changes?:Repair[];parties?:PreviewParty[];wallets?:{id:string;code:string|null;name:string;stored:string;expected:string}[]}>(repair?'/finance/outstanding/recalculate/preview':'/finance/outstanding-letters/preview',body);
  setPreview({hash:response.previewHash,signature,checked:response.checked,changes:response.changes,parties:response.parties,wallets:response.wallets});setRequestKey(crypto.randomUUID());setGenerated([]);setSelected([]);setPrintedConfirm(false);
 });}
 async function apply(){await action(async()=>{
  if(!fresh||!preview)throw new Error('Preview the current filters first');
  if(repair){const result=await apiPost<{changed:number}>('/finance/outstanding/recalculate/apply',{...body,previewHash:preview.hash});toast.success(result.changed+' document balances repaired');setPreview(null);await client.invalidateQueries();}
  else {const rows=await apiPost<Letter[]>('/finance/outstanding-letters/generate',{...body,previewHash:preview.hash,idempotencyKey:requestKey});setGenerated(rows);setSelected(rows.map(r=>r.id));toast.success(rows.length+' letters saved');await client.invalidateQueries({queryKey:['outstanding-letters']});}
 });}
 async function print(){const target=window.open('','_blank');if(!target){toast.error('Allow the print window');return;}await action(async()=>{
  try{const response=await api.post<Blob>('/finance/outstanding-letters/print',{ids:selected},{responseType:'blob'});const url=URL.createObjectURL(response.data);target.onload=()=>{target.focus();target.print();};target.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);setPrintedConfirm(true);}
  catch(e){target.close();throw e;}
 });}
 const letters=generated.length?generated:saved.data?.letters??[];
 return <div className="grid gap-6 p-4 md:p-6"><PageHeader title={repair?'Update outstanding':'Outstanding letters'} description={repair?'Compare stored balances with documents and active adjustments before applying audited repairs.':'Preview dated balances, save numbered letters, and reprint their original contents.'}/>
 <section className="grid gap-4 rounded-xl border bg-white p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 <Field label="Order"><select className={inputCls} value={order} onChange={e=>{setOrder(e.target.value as 'name'|'code');setFrom('');setTo('');}}><option value="name">Name wise</option><option value="code">Code wise</option></select></Field>
 <Field label="Party status"><select className={inputCls} value={partyStatus} onChange={e=>setStatus(e.target.value as Filters['partyStatus'])}><option value="ALL">{repair?"All parties":"Customers and dealers"}</option><option value="CUSTOMER">Customer</option><option value="DEALER">Dealer</option>{repair&&<option value="FA_PARTY">FA party</option>}</select></Field>
 <WorkshopPicker label="From party" endpoint={picker} collection="customers" value={fromCustomerId} onChange={setFrom} formatLabel={r=>[r.code,r.name].filter(Boolean).join(' · ')}/>
 <WorkshopPicker label="To party" endpoint={picker} collection="customers" value={toCustomerId} onChange={setTo} formatLabel={r=>[r.code,r.name].filter(Boolean).join(' · ')}/>
 {!repair&&<><Field label="As on"><input type="date" max={noteToday()} required className={inputCls} value={asOn} onChange={e=>setAsOn(e.target.value)}/></Field><Field label="Net outstanding greater than NGN"><input type="number" min="0" step="0.01" className={inputCls} value={threshold} onChange={e=>setThreshold(e.target.value)}/></Field></>}
 </div>{admin&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={all} onChange={e=>{setAll(e.target.checked);setFrom('');setTo('');setSelected([]);setGenerated([]);}}/>All branches</label>}
 {!repair&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={includePrinted} onChange={e=>setIncludePrinted(e.target.checked)}/>Include parties with previously printed letters</label>}
 <div className="flex flex-wrap gap-3"><Button disabled={busy||(!branchId&&!admin)} onClick={previewNow}>Preview {repair?'differences':'parties'}</Button><Button variant="outline" disabled={busy||!fresh||(!repair&&!preview?.parties?.length)||!!generated.length} onClick={apply}>{repair?'Apply reviewed differences':'Generate saved letters'}</Button></div>
 {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{preview&&!fresh&&<p role="status">Filters changed. Preview again before applying.</p>}
 </section>
 {repair&&preview&&<section className="grid gap-3"><p>{preview.checked} documents checked · {preview.changes?.length??0} differences. {preview.wallets?.length??0} customer credit cache differences.</p><DataTable data={preview.changes??[]} rowKey={r=>r.kind+r.id} columns={[{header:'Party',render:r=>[r.code,r.name].join(' · ')},{header:'Document',render:r=>r.number},{header:'Stored',render:r=>cash(r.stored)},{header:'Recalculated',render:r=>cash(r.expected)},{header:'Status',render:r=>r.statusBefore+' → '+r.status}]} />{!!preview.wallets?.length&&<DataTable data={preview.wallets} rowKey={r=>r.id} columns={[{header:"Party",render:r=>[r.code,r.name].filter(Boolean).join(" · ")},{header:"Stored available credit",render:r=>cash(r.stored)},{header:"Recalculated available credit",render:r=>cash(r.expected)}]}/>}</section>}
 {!repair&&preview&&<DataTable data={preview.parties??[]} rowKey={r=>r.id} columns={[{header:'Code',render:r=>r.code},{header:'Party',render:r=>r.name},{header:'Net outstanding',render:r=>cash(r.net)},{header:'Open bills',render:r=>r.bills}]}/>}
 {!repair&&<section className="grid gap-4 rounded-xl border bg-white p-4"><h2 className="font-semibold">Saved letters and reprints</h2><p className="text-sm">Reprints use saved amounts and content. Select letters, print, then confirm only after printing succeeds.</p><div className="grid gap-3 sm:grid-cols-3"><Field label="From reference"><input className={inputCls} value={fromRef} onChange={e=>setFromRef(e.target.value.toUpperCase())} placeholder="DML000001"/></Field><Field label="To reference"><input className={inputCls} value={toRef} onChange={e=>setToRef(e.target.value.toUpperCase())} placeholder="DML000100"/></Field><Button variant="outline" disabled={busy} onClick={()=>{setGenerated([]);setSelected([]);setSavedFilters({fromRef,toRef,page:1});setPrintedConfirm(false);}}>Find saved letters</Button></div>
 <DataTable data={letters} rowKey={r=>r.id} isLoading={saved.isLoading} columns={[{header:'Select',render:r=><input aria-label={'Select '+r.reference} type="checkbox" checked={selected.includes(r.id)} onChange={e=>{setSelected(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id));setPrintedConfirm(false);}}/>},{header:'Reference',render:r=>r.reference},{header:'Party',render:r=>r.snapshot.name},{header:'As on',render:r=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.asOn))},{header:'Net',render:r=>cash(r.totalOutstanding)},{header:'Printed',render:r=>r.printedAt?'Yes':'No'}]}/>
 {!generated.length&&<div className="flex items-center gap-3"><Button variant="outline" disabled={savedFilters.page<=1||busy} onClick={()=>{setSavedFilters(f=>({...f,page:f.page-1}));setSelected([]);setPrintedConfirm(false);}}>Previous</Button><span>Page {savedFilters.page} of {saved.data?.meta.totalPages||1}</span><Button variant="outline" disabled={busy||savedFilters.page>=(saved.data?.meta.totalPages||1)} onClick={()=>{setSavedFilters(f=>({...f,page:f.page+1}));setSelected([]);setPrintedConfirm(false);}}>Next</Button></div>}
 {saved.isError&&<p role="alert">Could not load saved letters. Check the reference range and retry.</p>}
 <div className="flex flex-wrap gap-3"><Button disabled={busy||!selected.length} onClick={print}>Print selected letters</Button><Button variant="outline" disabled={busy||!selected.length||!printedConfirm} onClick={()=>action(async()=>{await apiPost('/finance/outstanding-letters/printed',{ids:selected});toast.success('Print confirmation saved');setPrintedConfirm(false);setGenerated([]);setPreview(null);await client.invalidateQueries({queryKey:['outstanding-letters']});})}>Confirm printed successfully</Button></div></section>}
 {admin&&hasPermission('outstanding:recalculate')&&settingValues&&<section className="grid gap-4 rounded-xl border bg-white p-4"><h2 className="font-semibold">Credit terms and letter settings</h2><div className="grid gap-3 sm:grid-cols-2"><Field label="Company default credit days"><input type="number" min="0" max="3650" className={inputCls} value={settingValues.defaultCreditDays} onChange={e=>setDraft({...settingValues,defaultCreditDays:Number(e.target.value)})}/></Field><Field label="Letter prefix"><input className={inputCls} maxLength={10} value={settingValues.letterPrefix} onChange={e=>setDraft({...settingValues,letterPrefix:e.target.value.toUpperCase()})}/></Field></div><Field label="Letter content"><textarea rows={10} maxLength={10000} className={inputCls} value={settingValues.letterTemplate} onChange={e=>setDraft({...settingValues,letterTemplate:e.target.value})}/></Field><p className="text-sm">Required placeholders: {'{{customerName}}, {{address}}, {{asOn}}, {{totalOutstanding}}, {{billTable}}'}. New credit terms affect future bills; saved letters remain unchanged.</p><Button disabled={busy||!draft} onClick={()=>action(async()=>{await apiPut('/finance/settings/outstanding',settingValues);setDraft(null);setPreview(null);await client.invalidateQueries({queryKey:['outstanding-settings']});toast.success('Settings saved');})}>Save settings</Button></section>}
 </div>;
}
