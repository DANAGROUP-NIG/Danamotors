"use client";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Field, inputCls } from '@/components/forms/FormField';
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
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Charged hours (optional)"><input className={inputCls} type="number" min="0.01" max="1000000" step="0.01" placeholder="Defaults to model standard hours" value={value.chargedHours ?? ''} onChange={event => onChange({ ...value, chargedHours: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field><Field label="Mechanic assignment"><select className={inputCls} value={employee ? 'employee' : 'technician'} onChange={event => onChange({ ...value, technicianId: event.target.value === 'technician' ? '' : undefined, mechanicId: event.target.value === 'employee' ? '' : undefined })}><option value="technician">Technician login</option>{(canReadEmployees || employee) && <option value="employee">Employee mechanic</option>}</select></Field></div>
    {employee ? <WorkshopPicker label="Employee mechanic" endpoint={`/employees?branchId=${branchId}`} collection="employees" disabled={!canReadEmployees} value={value.mechanicId ?? ''} onChange={id => onChange({ ...value, mechanicId: id, technicianId: undefined })} /> : <WorkshopPicker label="Technician" endpoint={`/service/staff?role=Technician&branchId=${branchId}`} collection="users" value={value.technicianId ?? ''} onChange={id => onChange({ ...value, technicianId: id, mechanicId: undefined })} />}
    <WorkshopPicker label="Line group (optional)" endpoint="/workshop-masters?kind=TEAM" collection="items" value={value.groupId ?? ''} onChange={id => onChange({ ...value, groupId: id || undefined })} />
    <PayerFields value={value} onChange={payer => onChange({ ...value, ...payer })} campaigns={campaigns} goodwillPermission="warranty:update" />
    <p className="text-xs text-muted-foreground">Standard hours and rate come from the vehicle model schedule. Fixed-price operations keep their saved price when charged hours change.</p>
  </div>;
}
