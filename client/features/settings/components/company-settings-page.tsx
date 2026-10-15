"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { apiGet, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "@/features/branches/hooks/use-branches";

type Company = { name: string; tin: string | null; rcNumber: string | null; dealerCode: string | null };
type BranchSettings = {
  labourVatPercent: number;
  roundOffValue: number;
  repeatWindowDays: number;
  repeatWindowKm: number | null;
  bookingMaxDays: number;
  contactPerson: string | null;
  shifts: number;
  workStartTime: string;
  workingHours: number;
  weeklyHoliday: string | null;
  vorOrderDays: number;
  reorderMonths: number;
  courtLocation: string | null;
  reminderLetterDesignation: string | null;
  signatories: string[];
};
type NumberKey = { [K in keyof BranchSettings]: BranchSettings[K] extends number | null ? K : never }[keyof BranchSettings];

const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.message ?? "Could not save" : "Could not save";
const sectionCls = "grid gap-4 rounded-xl border border-border bg-background p-4 shadow-sm md:p-6";
const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

// Legacy Control screen, grouped by where each value is used.
const NUMBER_GROUPS: { title: string; note: string; fields: [NumberKey, string, string][] }[] = [
  {
    title: "Billing",
    note: "Applied to every job bill at this branch.",
    fields: [
      ["labourVatPercent", "VAT on labour and service (%)", "0.01"],
      ["roundOffValue", "Round bills down to a multiple of (₦)", "1"],
    ],
  },
  {
    title: "Repeat jobs and bookings",
    note: "A previous job counts as a repeat when it is within the days, or within the km of the new reading.",
    fields: [
      ["repeatWindowDays", "Repeat window (days)", "1"],
      ["repeatWindowKm", "Repeat window (km, blank = days only)", "1"],
      ["bookingMaxDays", "Bookings allowed up to (days ahead)", "1"],
    ],
  },
  {
    title: "Workshop information",
    note: "Kept for planning and the parts and workshop reports.",
    fields: [
      ["shifts", "Number of shifts", "1"],
      ["workingHours", "Working hours per day", "0.5"],
      ["vorOrderDays", "VOR order days", "1"],
      ["reorderMonths", "Reorder report: average consumption of last (months)", "1"],
    ],
  },
];

function CompanyDetails({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Company | null>(null);
  const query = useQuery({ queryKey: ["company-profile"], queryFn: () => apiGet<{ company: Company }>("/company-settings/company") });
  useEffect(() => { if (query.data) setForm(query.data.company); }, [query.data]);
  const save = useMutation({
    mutationFn: (values: Company) => apiPut("/company-settings/company", {
      name: values.name, tin: values.tin || null, rcNumber: values.rcNumber || null, dealerCode: values.dealerCode || null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["company-profile"] }),
  });
  return <form className={sectionCls} onSubmit={event => { event.preventDefault(); if (form) save.mutate(form); }}>
    <div><h2 className="font-semibold">Company details</h2>
      <p className="text-sm text-muted-foreground">Printed at the top of bills, estimates and orders with the branch address and phone (Branches screen).</p></div>
    {query.isError && <p role="alert">Could not load the company details. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {form && <div className="grid gap-3 md:grid-cols-2">
      {([["name", "Company name"], ["tin", "TIN / VAT registration no."], ["rcNumber", "RC number"], ["dealerCode", "Dealer code"]] as const).map(([key, label]) =>
        <Field key={key} label={label}><input className={inputCls} required={key === "name"} disabled={!canManage} value={form[key] ?? ""}
          onChange={event => setForm({ ...form, [key]: event.target.value })} /></Field>)}
    </div>}
    {save.isError && <p role="alert" className="text-destructive">{errorMessage(save.error)}</p>}
    {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Saved.</p>}
    {canManage && <Button className="justify-self-start" disabled={save.isPending || !form}>Save company details</Button>}
  </form>;
}

function BranchRules({ canManage }: { canManage: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: branchData } = useBranches({ limit: 100 });
  const [branchId, setBranchId] = useState(user?.branchId ?? "");
  const [form, setForm] = useState<BranchSettings | null>(null);
  const query = useQuery({
    queryKey: ["branch-settings", branchId],
    queryFn: () => apiGet<{ settings: BranchSettings }>(`/company-settings/branches/${branchId}`),
    enabled: !!branchId,
  });
  useEffect(() => { setForm(query.data?.settings ?? null); }, [query.data]);
  const save = useMutation({
    mutationFn: (values: BranchSettings) => apiPut(`/company-settings/branches/${branchId}`, {
      ...values,
      signatories: values.signatories.map(name => name.trim()).filter(Boolean),
      contactPerson: values.contactPerson || null,
      courtLocation: values.courtLocation || null,
      reminderLetterDesignation: values.reminderLetterDesignation || null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["branch-settings", branchId] }),
  });
  return <form className={sectionCls} onSubmit={event => { event.preventDefault(); if (form) save.mutate(form); }}>
    <div><h2 className="font-semibold">Branch rules</h2>
      <p className="text-sm text-muted-foreground">Each branch keeps its own values, as each legacy location did.</p></div>
    <Field label="Branch"><select className={`${inputCls} max-w-md`} value={branchId} onChange={event => { setBranchId(event.target.value); save.reset(); }}>
      <option value="">Select branch</option>
      {branchData?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field>
    {query.isError && <p role="alert">Could not load the branch rules. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
    {form && <>
      {NUMBER_GROUPS.map(group => <fieldset key={group.title} className="grid gap-3 border-t pt-4" disabled={!canManage}>
        <legend className="text-sm font-semibold">{group.title}</legend>
        <p className="text-sm text-muted-foreground">{group.note}</p>
        <div className="grid gap-3 md:grid-cols-3">{group.fields.map(([key, label, step]) => <Field key={key} label={label}>
          <input className={inputCls} type="number" min={key === "vorOrderDays" || key === "labourVatPercent" ? 0 : 1} step={step}
            required={key !== "repeatWindowKm"} value={form[key] ?? ""}
            onChange={event => setForm({ ...form, [key]: event.target.value === "" ? null : Number(event.target.value) })} /></Field>)}</div>
      </fieldset>)}
      <fieldset className="grid gap-3 border-t pt-4 md:grid-cols-3" disabled={!canManage}>
        <legend className="text-sm font-semibold">Contact, hours, letters and signatories</legend>
        <Field label="Work starts at"><input className={inputCls} type="time" required value={form.workStartTime}
          onChange={event => setForm({ ...form, workStartTime: event.target.value })} /></Field>
        <Field label="Weekly holiday"><select className={inputCls} value={form.weeklyHoliday ?? ""} onChange={event => setForm({ ...form, weeklyHoliday: event.target.value || null })}>
          <option value="">None</option>{DAYS.map(day => <option key={day} value={day}>{day[0] + day.slice(1).toLowerCase()}</option>)}</select></Field>
        <Field label="Contact person"><input className={inputCls} maxLength={100} value={form.contactPerson ?? ""}
          onChange={event => setForm({ ...form, contactPerson: event.target.value })} /></Field>
        <Field label="Court location (jurisdiction)"><input className={inputCls} maxLength={100} value={form.courtLocation ?? ""}
          onChange={event => setForm({ ...form, courtLocation: event.target.value })} /></Field>
        <Field label="Designation on reminder letters"><input className={inputCls} maxLength={100} value={form.reminderLetterDesignation ?? ""}
          onChange={event => setForm({ ...form, reminderLetterDesignation: event.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="Authorised signatories (one per line, up to 5)">
          <textarea className={inputCls} rows={3} value={form.signatories.join("\n")}
            onChange={event => setForm({ ...form, signatories: event.target.value.split("\n").slice(0, 5) })} /></Field></div>
      </fieldset>
      {save.isError && <p role="alert" className="text-destructive">{errorMessage(save.error)}</p>}
      {save.isSuccess && <p role="status" className="text-sm text-emerald-700">Saved.</p>}
      {canManage && <Button className="justify-self-start" disabled={save.isPending}>Save branch rules</Button>}
    </>}
  </form>;
}

export function CompanySettingsPage() {
  const { isAdminOrAbove } = useAuth();
  return <div className="grid max-w-5xl gap-5 p-4 lg:p-6">
    <PageHeader title="Company & branch settings" description="Company details printed on documents, and each branch's billing, repeat-job, booking and workshop rules." />
    <CompanyDetails canManage={isAdminOrAbove} />
    <BranchRules canManage={isAdminOrAbove} />
  </div>;
}
