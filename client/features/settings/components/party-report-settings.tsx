
"use client";
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useState } from 'react';
import { useQuery,useMutation,useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/headers/page-header';
import { Field,inputCls } from '@/components/forms/FormField';
import { Button } from '@/components/ui/button';
import { getReportSettings,saveReportSettings } from '@/features/reports/api/party-report.api';
export function PartyReportSettings(){const {user}=useAuth();const admin=user?.role==='Admin'||user?.role==='SuperAdmin';const queryClient=useQueryClient();const query=useQuery({queryKey:['party-report-settings'],queryFn:getReportSettings,enabled:admin});const [draft,setDraft]=useState<string[]>();const values=draft??query.data?.ageLimits.map(String)??['30','60','90','120','180'];const limits=values.map(Number);const valid=limits.length===5&&limits.every((n,i)=>Number.isInteger(n)&&n>0&&n<=3650&&(i===0||n>limits[i-1]));
 const save=useMutation({mutationFn:saveReportSettings,onSuccess:()=>{queryClient.invalidateQueries({queryKey:['party-report-settings']});toast.success('Age limits saved');setDraft(undefined);},onError:()=>toast.error('Age limits could not be saved')});
 if(!admin)return <p role="alert" className="p-6">Only administrators can manage company ageing defaults.</p>;
 return <div className="flex flex-col gap-5 p-4 lg:p-6"><PageHeader title="Party report settings" description="Company defaults for outstanding age bands."/>
 {query.isLoading?<div className="h-24 animate-pulse rounded-lg bg-muted" aria-busy="true"/>:query.isError?<div role="alert"><p>Settings could not be loaded.</p><Button onClick={()=>query.refetch()}>Retry</Button></div>:<form className="grid max-w-2xl gap-4 rounded-xl border bg-background p-5" onSubmit={e=>{e.preventDefault();if(valid)save.mutate(limits);}}><div className="grid gap-3 sm:grid-cols-5">{values.map((v,i)=><Field key={i} label={'Limit '+(i+1)+' (days)'}><input type="number" min="1" max="3650" step="1" className={inputCls} value={v} aria-invalid={!valid} onChange={e=>{const next=[...values];next[i]=e.target.value;setDraft(next);}}/></Field>)}</div>{!valid&&<p role="alert" className="text-sm text-destructive">Enter five increasing whole-day limits from 1 to 3650.</p>}<p className="text-sm text-muted-foreground">Users can override these limits for an individual report run. Changing defaults does not alter saved financial documents.</p><Button disabled={!valid||save.isPending}>{save.isPending?'Saving…':'Save age limits'}</Button></form>}</div>;
}
