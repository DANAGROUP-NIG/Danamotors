"use client";
import { useEffect, useState } from "react";
import { CalendarClock, FileText, Landmark, Printer, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/forms/DateInput";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker, customerLabel, customerOption } from "@/features/job-cards/components/WorkshopPicker";
import { usePdiSettings, useSavePdiSettings } from "../hooks/use-pdi";
import { formatDateTime, PDI_PERMISSIONS } from "../lib/pdi.logic";
import type { PdiSettings, PdiSettingsPayload } from "../types/pdi.types";
import { PageState, PdiField, SectionCard, pdiInput, tdCls, thCls } from "./pdi-ui";

const DOCUMENTS = [
  { key: "job", label: "PDI job card" },
  { key: "requisition", label: "PDI requisition" },
  { key: "return", label: "PDI requisition return" },
  { key: "labour", label: "PDI labour slip" },
  { key: "bill", label: "PDI bill" },
] as const;
type DocKey = (typeof DOCUMENTS)[number]["key"];

/** Company-wide PDI settings: freeze dates and edit rules per document, bill rounding, titles, history and Tally. */
export function PdiSettingsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PDI_PERMISSIONS.SETTINGS);
  const settings = usePdiSettings();
  const save = useSavePdiSettings();
  const [draft, setDraft] = useState<PdiSettings | null>(null);
  useEffect(() => { if (settings.data) setDraft(settings.data); }, [settings.data]);

  if (settings.isLoading || (!draft && !settings.isError)) return <PageState loading />;
  if (settings.isError || !draft) return <PageState message="Could not load PDI settings." />;
  const set = (patch: Partial<PdiSettings>) => setDraft(current => current ? { ...current, ...patch } : current);
  const freeze = (key: DocKey) => draft[`${key}FreezeDate`]?.slice(0, 10) ?? "";

  const submit = () => {
    const payload: PdiSettingsPayload = {
      roundBill: draft.roundBill, includeInHistory: draft.includeInHistory, postBillsToTally: draft.postBillsToTally,
      invoiceTitle: draft.invoiceTitle.trim(), cashMemoTitle: draft.cashMemoTitle.trim(), defaultCustomerId: draft.defaultCustomerId,
    };
    for (const { key } of DOCUMENTS) {
      payload[`${key}FreezeDate`] = freeze(key) || null;
      payload[`${key}EditBeforePrint`] = draft[`${key}EditBeforePrint`];
      payload[`${key}EditAfterPrint`] = draft[`${key}EditAfterPrint`];
    }
    save.mutate(payload);
  };

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader
        title="PDI settings"
        description={`Company-wide, for every branch. Last saved ${formatDateTime(draft.updatedAt === new Date(0).toISOString() ? null : draft.updatedAt)}.`}
        actions={canEdit && <Button onClick={submit} disabled={save.isPending || !draft.invoiceTitle.trim() || !draft.cashMemoTitle.trim()}>{save.isPending ? "Saving…" : "Save settings"}</Button>}
      />
      <fieldset disabled={!canEdit} className="space-y-6">
        <SectionCard icon={<CalendarClock />} title="Freeze dates and edit rules" note="No create or edit on or before the freeze date; the print rules decide when a document can still change">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>{["Document", "Freeze date", "Allow change before print", "Allow change after print"].map(label => <th key={label} className={thCls}>{label}</th>)}</tr></thead>
              <tbody>
                {DOCUMENTS.map(({ key, label }) => (
                  <tr key={key} className="border-t border-border">
                    <td className={`${tdCls} font-medium`}>{label}</td>
                    <td className={`${tdCls} w-56`}>
                      <div className="flex items-center gap-2">
                        <DateInput value={freeze(key)} onChange={value => set({ [`${key}FreezeDate`]: value.slice(0, 10) || null } as Partial<PdiSettings>)} placeholder="Not frozen" />
                        {freeze(key) && <Button type="button" variant="ghost" size="sm" onClick={() => set({ [`${key}FreezeDate`]: null } as Partial<PdiSettings>)}>Clear</Button>}
                      </div>
                    </td>
                    <td className={tdCls}><input type="checkbox" className="size-4" aria-label={`${label}: allow change before print`} checked={draft[`${key}EditBeforePrint`]} onChange={event => set({ [`${key}EditBeforePrint`]: event.target.checked } as Partial<PdiSettings>)} /></td>
                    <td className={tdCls}><input type="checkbox" className="size-4" aria-label={`${label}: allow change after print`} checked={draft[`${key}EditAfterPrint`]} onChange={event => set({ [`${key}EditAfterPrint`]: event.target.checked } as Partial<PdiSettings>)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard icon={<Printer />} title="PDI bill">
            <div className="space-y-4">
              <PdiField label="Invoice print title" required><input className={pdiInput} maxLength={60} value={draft.invoiceTitle} onChange={event => set({ invoiceTitle: event.target.value })} /></PdiField>
              <PdiField label="Cash memo print title" required hint="Also used for zero bills"><input className={pdiInput} maxLength={60} value={draft.cashMemoTitle} onChange={event => set({ cashMemoTitle: event.target.value })} /></PdiField>
              <Toggle label="Round the PDI bill" hint="Uses the branch round-off value; off keeps the exact amount" checked={draft.roundBill} onChange={roundBill => set({ roundBill })} />
            </div>
          </SectionCard>
          <SectionCard icon={<FileText />} title="Default PDI customer" note="PDIs are opened for this customer unless a fleet buyer is chosen">
            <WorkshopPicker label="Customer" endpoint="/customers" collection="customers" formatLabel={customerLabel} renderOption={customerOption}
              value={draft.defaultCustomerId ?? ""} selectedRecord={draft.defaultCustomer ? { id: draft.defaultCustomer.id, firstName: draft.defaultCustomer.firstName, lastName: draft.defaultCustomer.lastName, companyName: draft.defaultCustomer.companyName } : undefined}
              onChange={id => set({ defaultCustomerId: id || null })} />
          </SectionCard>
          <SectionCard icon={<ShieldCheck />} title="Vehicle history">
            <Toggle label="Include PDI in vehicle history" hint="Off (recommended): PDI jobs stay out of the service history and history card. Customer-facing views never show PDI." checked={draft.includeInHistory} onChange={includeInHistory => set({ includeInHistory })} />
          </SectionCard>
          <SectionCard icon={<Landmark />} title="Accounts (Tally)">
            <Toggle label="Post PDI bills to Tally" hint="PDI bills post to the PDI_BILL ledgers (PDI account and PDI party) mapped in Finance → Tally. Zero bills are never posted." checked={draft.postBillsToTally} onChange={postBillsToTally => set({ postBillsToTally })} />
          </SectionCard>
        </div>
      </fieldset>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-1 size-4" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
    </label>
  );
}
