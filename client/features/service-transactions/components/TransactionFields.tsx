"use client";
import { Field, inputCls } from '@/components/forms/FormField';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import type { ChargeType } from '../document.types';
import type { Payer } from '../document.types';
export type { Payer } from '../document.types';
export function PayerFields({ value, onChange, goodwillPermission = 'requisition:goodwill', campaigns = [] }: { value: Payer; onChange: (value: Payer) => void; goodwillPermission?: string; campaigns?: { campaignId: string; campaignTitle?: string }[] }) {
  const { hasPermission } = useAuth();
  return <div className="grid gap-3 sm:grid-cols-2"><Field label="Requisition type"><select className={inputCls} value={value.chargeType} onChange={event => onChange({ chargeType: event.target.value as ChargeType })}><option value="CUSTOMER">Non warranty</option><option value="WARRANTY">Warranty</option><option value="FREE">Free of cost</option>{hasPermission(goodwillPermission) && <option value="GOODWILL">Goodwill</option>}</select></Field>
    {value.chargeType === 'FREE' && <Field label="Linked campaign"><select className={inputCls} required value={value.campaignId ?? ''} onChange={event => onChange({ ...value, campaignId: event.target.value })}><option value="">Select campaign</option>{campaigns.map(campaign => <option key={campaign.campaignId} value={campaign.campaignId}>{campaign.campaignTitle ?? campaign.campaignId}</option>)}</select></Field>}
    {value.chargeType === 'GOODWILL' && <Field label="Goodwill reason"><input className={inputCls} required maxLength={2000} value={value.reason ?? ''} onChange={event => onChange({ ...value, reason: event.target.value })} /></Field>}
  </div>;
}
export function AssignmentFields({ branchId, groupId, engineerId, onGroup, onEngineer }: { branchId: string; groupId: string; engineerId: string; onGroup: (id: string) => void; onEngineer: (id: string) => void }) {
  return <div className="grid gap-3 sm:grid-cols-2"><WorkshopPicker label="Group (optional)" endpoint="/workshop-masters?kind=TEAM" collection="items" value={groupId} onChange={onGroup} /><WorkshopPicker label="Engineer (optional)" endpoint={`/service/staff?role=Engineer&branchId=${branchId}`} collection="users" value={engineerId} onChange={onEngineer} /></div>;
}
