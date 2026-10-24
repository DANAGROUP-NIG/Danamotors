"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DocumentLine } from '../hooks/use-service-transactions';
import { useServiceAction } from '../hooks/use-service-transactions';
import { LabourLineEditor, labourBody, type LabourDraft } from './LabourLineEditor';
export function SavedLabourLine({ line, slipId, branchId, campaigns }: { line: DocumentLine; slipId: string; branchId: string; campaigns?: { campaignId: string; campaignTitle?: string }[] }) {
  const save = useServiceAction();
  const [draft, setDraft] = useState<LabourDraft>({ labourItemId: line.labourItemId ?? '', technicianId: line.technicianId ?? undefined, mechanicId: line.mechanicId ?? undefined, groupId: line.groupId ?? undefined, chargedHours: line.chargedHours ?? line.hours, chargeType: (line.chargeLine?.chargeType ?? 'CUSTOMER') as LabourDraft['chargeType'] });
  return <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm">Edit {line.labourItem?.code ?? line.description}</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); save.mutate({ url: `/service/labour-slips/${slipId}/lines/${line.id}`, method: 'put', body: labourBody(draft) }); }}><fieldset className="space-y-3" disabled={save.isPending}><LabourLineEditor value={draft} onChange={setDraft} branchId={branchId} campaigns={campaigns} /><Button disabled={!draft.labourItemId || (!draft.technicianId && !draft.mechanicId)}>Save labour line</Button></fieldset></form></details>;
}
