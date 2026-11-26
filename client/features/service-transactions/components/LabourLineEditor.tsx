"use client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Field, inputCls } from '@/components/forms/FormField';
import { NumberInput } from '@/components/forms/NumberInput';
import { WorkshopPicker } from '@/features/job-cards/components/WorkshopPicker';
import { PayerFields } from './TransactionFields';
import type { LabourDraft } from '../document.types';
export type { LabourDraft } from '../document.types';
export { labourBody } from '../transaction.logic';
export const emptyLabour = (): LabourDraft => ({ labourItemId: '', chargeType: 'CUSTOMER' });
export function LabourLineEditor({ value, onChange, branchId, campaigns = [] }: { value: LabourDraft; onChange: (value: LabourDraft) => void; branchId: string; campaigns?: { campaignId: string; campaignTitle?: string }[] }) {
  const { hasPermission } = useAuth();
  const canReadEmployees = hasPermission("employee:read");
  const employee = value.mechanicId !== undefined;
  return <div className="space-y-3"><WorkshopPicker label="Labour operation" endpoint="/service/labour-items" collection="labourItems" value={value.labourItemId} onChange={id => onChange({ ...value, labourItemId: id })} />
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Charged hours (optional)"><NumberInput className={inputCls} min="0.01" max="1000000" step="0.01" placeholder="Defaults to model standard hours" value={value.chargedHours} onValueChange={v => onChange({ ...value, chargedHours: v ?? undefined })} /></Field>
      {employee ? (
        <WorkshopPicker label="Technician" endpoint={`/employees?branchId=${branchId}`} collection="employees" disabled={!canReadEmployees} value={value.mechanicId ?? ''} onChange={id => onChange({ ...value, mechanicId: id, technicianId: undefined })} />
      ) : (
        <WorkshopPicker label="Technician" endpoint={`/service/staff?role=Technician&branchId=${branchId}`} collection="users" value={value.technicianId ?? ''} onChange={id => onChange({ ...value, technicianId: id })} />
      )}
    </div>
    <WorkshopPicker label="Line group (optional)" endpoint="/workshop-masters?kind=TEAM" collection="items" value={value.groupId ?? ''} onChange={id => onChange({ ...value, groupId: id || undefined })} />
    <PayerFields label="Charge type" value={value} onChange={payer => onChange({ ...value, ...payer })} campaigns={campaigns} goodwillPermission="warranty:update" />
    <p className="text-xs text-muted-foreground">Standard hours and rate come from the vehicle model schedule. Fixed-price operations keep their saved price when charged hours change.</p>
  </div>;
}
