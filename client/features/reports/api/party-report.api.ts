
import { apiGet,apiPut } from '@/lib/api/apiClient';
import { api } from '@/lib/api/axios';
import { getAccessTokenFromCookie } from '@/lib/auth/session';
export type ReportKind='ledger'|'outstanding'|'age'|'bill';
export type ReportFilters={kind:ReportKind;branchId?:string;customerId?:string;fromCustomerId?:string;toCustomerId?:string;order:'name'|'code';partyStatus:'ALL'|'CUSTOMER'|'DEALER'|'FA_PARTY';from?:string;to?:string;asOn?:string;showCredit:'true'|'false';ageLimits?:string;page:number;pageSize:number};
export type ReportRow={customerId:string;code:string|null;name:string;[key:string]:string|number|null};
export type PartyReport={rows:ReportRow[];totals:ReportRow;ageLimits:number[];meta:{page:number;pageSize:number;total:number;totalPages:number}};
export const reportQuery=(filters:ReportFilters)=>new URLSearchParams(Object.entries(filters).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>[k,String(v)])).toString();
export const getPartyReport=(filters:ReportFilters,signal?:AbortSignal)=>apiGet<PartyReport>('/finance/party-reports?'+reportQuery(filters),{signal});
export const getReportSettings=()=>apiGet<{ageLimits:number[]}>('/finance/settings/party-reports');
export const saveReportSettings=(ageLimits:number[])=>apiPut<{ageLimits:number[]}>('/finance/settings/party-reports',{ageLimits});
type SavePickerWindow=Window & {showSaveFilePicker?:(options:{suggestedName:string;types:Array<{description:string;accept:Record<string,string[]>}>})=>Promise<{createWritable:()=>Promise<WritableStream<Uint8Array>>}>};
export async function exportPartyReport(filters:ReportFilters){
 // Refresh authentication through the established API layer before the streamed request.
 const picker=(window as SavePickerWindow).showSaveFilePicker;
 const file=picker?await picker.call(window,{suggestedName:'dana-party-'+filters.kind+'.xml',types:[{description:'Excel XML workbook',accept:{'application/xml':['.xml']}}]}):undefined;
 await getReportSettings();
 const token=getAccessTokenFromCookie();
 const response=await fetch('/api/finance/party-reports/export?'+reportQuery(filters),{headers:token?{Authorization:'Bearer '+token}:{},cache:'no-store'});
 if(!response.ok||!response.body)throw new Error('Export failed. Refresh your session and try again.');
 if(file){const writable=await file.createWritable();await response.body.pipeTo(writable);return;}
 // Browsers without disk streaming use a strictly bounded fallback.
 const reader=response.body.getReader();const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>20*1024*1024){await reader.cancel();throw new Error('This export exceeds 20 MB. Narrow the filters or use a browser with save-to-disk support.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const url=URL.createObjectURL(new Blob(chunks,{type:'application/vnd.ms-excel'}));const link=document.createElement('a');link.href=url;link.download='dana-party-'+filters.kind+'.xml';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export async function printPartyReport(filters:ReportFilters,target:Window){
 try{const response=await api.get<Blob>('/finance/party-reports/print?'+reportQuery(filters),{responseType:'blob'});const url=URL.createObjectURL(response.data);target.onload=()=>{target.focus();target.print();};target.location.href=url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
 catch(error){target.close();throw error;}
}
