"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Car, CheckCircle2, CircleDashed, ClipboardList, Disc3, Plus, Search, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { PageHeader } from "@/components/headers/page-header";
import { cn } from "@/lib/utils";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WorkshopPicker, customerLabel, customerOption } from "@/features/job-cards/components/WorkshopPicker";
import { useOpenPdi, usePdiServiceTypes, usePdiSettings, usePdiVehicles } from "../hooks/use-pdi";
import { defectGridTotals, defectLineValid, formatDate, formatMoney, pdiRegistrationFromVin } from "../lib/pdi.logic";
import type { DefectDraft, PdiVehicle, TyreDraft } from "../types/pdi.types";
import { DefectsGrid, emptyDefect } from "./DefectsGrid";
import { NewVehicleDialog } from "./NewVehicleDialog";
import { AlertBanner, PdiField, SectionCard, pdiInput, pdiNumberInput } from "./pdi-ui";
import { TyreBatteryFields, emptyTyres, tyrePayload } from "./TyreBatteryFields";

const tomorrowAt = (hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

/** Opening a PDI job card: vehicle by VIN (or a new vehicle), job details, defects grid and tyres. */
export function PdiOpenPage() {
  const router = useRouter();
  const { user } = useAuth();
  const activeBranch = useBranchStore(state => state.activeBranch);
  const branchId = activeBranch?.id ?? user?.branchId ?? "";
  const settings = usePdiSettings();
  const open = useOpenPdi();

  const [vinSearch, setVinSearch] = useState("");
  const [debouncedVin, setDebouncedVin] = useState("");
  const [vehicle, setVehicle] = useState<PdiVehicle | null>(null);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState({
    serviceTypeId: "", mileage: "", pdiRegistration: "", promisedAt: tomorrowAt(16), bayId: "", teamId: "", engineerId: "",
    serviceAdvisorId: user?.role === "ServiceAdviser" ? user.id : "", customerMode: "default" as "default" | "other", customerId: "",
    acType: "FACTORY" as "FACTORY" | "DEALER" | "NONE", remarks: "", batteryMakeId: "", batteryNumber: "",
  });
  const [defects, setDefects] = useState<DefectDraft[]>([emptyDefect()]);
  const [tyres, setTyres] = useState<TyreDraft[]>(emptyTyres());
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedVin(vinSearch.trim().toUpperCase()), 300);
    return () => window.clearTimeout(timer);
  }, [vinSearch]);
  const vehicles = usePdiVehicles(debouncedVin);
  const serviceTypes = usePdiServiceTypes(vehicle?.id ?? "");

  // A single PDI service type is chosen for the user.
  useEffect(() => {
    const items = serviceTypes.data?.items ?? [];
    if (items.length === 1) setForm(current => current.serviceTypeId ? current : { ...current, serviceTypeId: items[0].id });
  }, [serviceTypes.data]);

  const chooseVehicle = (picked: PdiVehicle) => {
    setVehicle(picked);
    set({ pdiRegistration: pdiRegistrationFromVin(picked.vin), serviceTypeId: "", mileage: picked.lastRecordedMileage != null ? String(picked.lastRecordedMileage) : "" });
    const existing = (picked.tyres ?? []).slice(0, 5);
    if (existing.some(tyre => tyre.makeId || tyre.number)) setTyres([...existing.map(tyre => ({ makeId: tyre.makeId, number: tyre.number })), ...emptyTyres()].slice(0, 5));
  };

  const totals = defectGridTotals(defects);
  const mileage = Number(form.mileage);
  const errors = {
    vehicle: vehicle ? undefined : "Find the vehicle by VIN or create it",
    serviceTypeId: form.serviceTypeId ? undefined : "Choose the PDI service type",
    mileage: form.mileage !== "" && Number.isInteger(mileage) && mileage >= 0 ? undefined : "Enter the mileage in whole km",
    pdiRegistration: form.pdiRegistration.trim() ? undefined : "Enter the PDI registration",
    promisedAt: form.promisedAt && new Date(form.promisedAt) > new Date() ? undefined : "Choose a promised date in the future",
    bayId: form.bayId ? undefined : "Choose the bay",
    teamId: form.teamId ? undefined : "Choose the group",
    engineerId: form.engineerId ? undefined : "Choose the engineer",
    serviceAdvisorId: form.serviceAdvisorId ? undefined : "Choose who received the vehicle",
    customer: form.customerMode === "other" ? (form.customerId ? undefined : "Choose the customer") : settings.data?.defaultCustomerId ? undefined : "Set the default PDI customer in PDI settings, or choose a customer",
    defects: defects.every(defectLineValid) ? undefined : "Every defect line needs a defect or a description",
  };
  const show = (key: keyof typeof errors) => touched ? errors[key] : undefined;
  const missing = Object.values(errors).filter(Boolean) as string[];

  const checklist = useMemo(() => [
    { label: "Vehicle", done: !!vehicle },
    { label: "Job details", done: !errors.serviceTypeId && !errors.mileage && !errors.bayId && !errors.teamId && !errors.engineerId && !errors.serviceAdvisorId && !errors.promisedAt },
    { label: "Defect lines", done: !errors.defects },
    { label: "Tyres (optional)", done: tyres.some(tyre => tyre.makeId || tyre.number) },
  ], [vehicle, errors.serviceTypeId, errors.mileage, errors.bayId, errors.teamId, errors.engineerId, errors.serviceAdvisorId, errors.promisedAt, errors.defects, tyres]);

  const submit = () => {
    setTouched(true);
    if (missing.length || !vehicle) return;
    open.mutate({
      branchId,
      vehicleId: vehicle.id,
      customerId: form.customerMode === "other" ? form.customerId : undefined,
      serviceTypeId: form.serviceTypeId,
      mileage,
      pdiRegistration: form.pdiRegistration.trim().toUpperCase(),
      promisedAt: new Date(form.promisedAt).toISOString(),
      bayId: form.bayId,
      teamId: form.teamId,
      engineerId: form.engineerId,
      serviceAdvisorId: form.serviceAdvisorId,
      acType: form.acType,
      remarks: form.remarks.trim() || undefined,
      defects: defects.map(row => ({ defectId: row.defectId || undefined, description: row.description.trim() || undefined, spare: row.spare, oil: row.oil, labour: row.labour })),
      tyres: tyrePayload(tyres),
      batteryMakeId: form.batteryMakeId || undefined,
      batteryNumber: form.batteryNumber.trim() || undefined,
    }, { onSuccess: job => router.push(`/pdi/${job.id}`) });
  };

  const sizes = vehicle?.catalogue?.attributes ? { front: vehicle.catalogue.attributes.frontTyreSize, rear: vehicle.catalogue.attributes.rearTyreSize } : undefined;

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <Link href="/pdi" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> PDI job cards</Link>
      <PageHeader title="Open PDI job card" description="Pre-delivery inspection of a new vehicle. The PDI gets its own number and never appears in the vehicle's service history." />

      {!branchId && <AlertBanner tone="amber" icon={<AlertTriangle />} title="Choose a branch">Select the branch in the header before opening a PDI.</AlertBanner>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard icon={<Car />} title="Vehicle" note="Find it by VIN, or create a new vehicle from the catalogue">
            {vehicle ? (
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-4">
                <div className="grid min-w-0 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="VIN" value={<span className="font-mono">{vehicle.vin}</span>} />
                  <Info label="Model / variant" value={[vehicle.catalogue?.parent?.description ?? vehicle.model, vehicle.catalogue?.description ?? vehicle.trim].filter(Boolean).join(" · ") || "—"} />
                  <Info label="Colour" value={vehicle.colour?.description ?? vehicle.color ?? "—"} />
                  <Info label="Engine no." value={vehicle.engineNumber ?? "—"} />
                  <Info label="Registration" value={vehicle.registrationNumber ?? "Not registered (new vehicle)"} />
                  <Info label="PDI" value={vehicle.pdiDone ? `Done ${formatDate(vehicle.pdiDate)}` : "Not done"} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setVehicle(null); setTyres(emptyTyres()); }}>Change vehicle</Button>
                {vehicle.pdiDone && (
                  <AlertBanner tone="amber" icon={<AlertTriangle />} title="This vehicle already has a PDI" className="w-full">
                    {vehicle.pdiJobs?.map(job => job.jobNumber).join(", ") || "Recorded on the vehicle"} · opening another PDI is allowed, but check it is not a duplicate.
                  </AlertBanner>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                    <input aria-label="Search by VIN" aria-invalid={!!show("vehicle")} className={cn(pdiInput, "pl-9 font-mono uppercase", show("vehicle") && "border-destructive")} placeholder="Type the VIN or its last digits" value={vinSearch} onChange={event => setVinSearch(event.target.value)} />
                  </div>
                  <Button type="button" variant="outline" className="gap-1.5" onClick={() => setCreatingVehicle(true)}><Plus className="size-4" /> New vehicle</Button>
                </div>
                {show("vehicle") && <p className="text-xs text-destructive">{errors.vehicle}</p>}
                {debouncedVin.length >= 3 && (
                  vehicles.isLoading ? <p role="status" className="text-sm text-muted-foreground">Searching…</p>
                  : vehicles.isError ? <p role="alert" className="text-sm text-destructive">Could not search vehicles.</p>
                  : vehicles.data?.length ? (
                    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                      {vehicles.data.map(row => (
                        <li key={row.id}>
                          <button type="button" onClick={() => chooseVehicle(row)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted">
                            <span className="min-w-0">
                              <span className="block font-mono text-sm font-semibold">{row.vin}</span>
                              <span className="block text-xs text-muted-foreground">{[row.catalogue?.description ?? row.model, row.colour?.description ?? row.color, row.registrationNumber].filter(Boolean).join(" · ")}</span>
                            </span>
                            <span className={cn("text-xs font-medium", row.pdiDone ? "text-amber-700" : "text-emerald-700")}>{row.pdiDone ? "PDI done" : "No PDI yet"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No vehicle with this VIN yet.
                      <Button type="button" size="sm" onClick={() => setCreatingVehicle(true)}>Create {debouncedVin}</Button>
                    </div>
                  )
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<ClipboardList />} title="Job details">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <PdiField label="Service type" required error={show("serviceTypeId")} hint={vehicle && serviceTypes.data?.message ? serviceTypes.data.message : "PDI service types only"}>
                <select className={pdiInput} disabled={!vehicle || serviceTypes.isLoading} value={form.serviceTypeId} onChange={event => set({ serviceTypeId: event.target.value })}>
                  <option value="">{vehicle ? serviceTypes.isLoading ? "Loading…" : "Choose" : "Choose the vehicle first"}</option>
                  {(serviceTypes.data?.items ?? []).map(type => <option key={type.id} value={type.id}>{type.code} · {type.description}{type.serviceCharge ? ` (${formatMoney(type.serviceCharge)})` : ""}</option>)}
                </select>
              </PdiField>
              <PdiField label="Mileage (km)" required error={show("mileage")}>
                <input className={pdiNumberInput} inputMode="numeric" value={form.mileage} onChange={event => set({ mileage: event.target.value.replace(/[^0-9]/g, "") })} />
              </PdiField>
              <PdiField label="PDI registration" required error={show("pdiRegistration")} hint={vehicle ? <>Last 6 of the VIN by default. <button type="button" className="underline" onClick={() => set({ pdiRegistration: pdiRegistrationFromVin(vehicle.vin) })}>Reset</button></> : "Filled from the VIN"}>
                <input className={`${pdiInput} font-mono uppercase`} maxLength={20} value={form.pdiRegistration} onChange={event => set({ pdiRegistration: event.target.value })} />
              </PdiField>
              <PdiField label="Promised date and time" required error={show("promisedAt")}>
                <DateTimeInput value={form.promisedAt} onChange={promisedAt => set({ promisedAt })} />
              </PdiField>
              <WorkshopPicker label="Bay" required endpoint="/workshop-masters?kind=BAY" collection="items" value={form.bayId} error={show("bayId")} onChange={bayId => set({ bayId })} />
              <WorkshopPicker label="Group" required endpoint="/workshop-masters?kind=TEAM" collection="items" value={form.teamId} error={show("teamId")} onChange={teamId => set({ teamId })} />
              <WorkshopPicker label="Engineer" required endpoint={`/service/staff?role=Engineer&branchId=${branchId}`} collection="users" disabled={!branchId} value={form.engineerId} error={show("engineerId")} onChange={engineerId => set({ engineerId })} />
              <WorkshopPicker label="Received by (service adviser)" required endpoint={`/service/staff?role=ServiceAdviser&branchId=${branchId}`} collection="users" disabled={!branchId} value={form.serviceAdvisorId} error={show("serviceAdvisorId")} onChange={serviceAdvisorId => set({ serviceAdvisorId })} />
              <PdiField label="A/C">
                <select className={pdiInput} value={form.acType} onChange={event => set({ acType: event.target.value as typeof form.acType })}>
                  <option value="FACTORY">Factory fitted</option>
                  <option value="DEALER">Dealer fitted</option>
                  <option value="NONE">No A/C</option>
                </select>
              </PdiField>
            </div>
            <div className="mt-5 grid gap-4 border-t border-border pt-5 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><UserRound className="size-4 text-muted-foreground" /> Customer</p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="radio" checked={form.customerMode === "default"} onChange={() => set({ customerMode: "default" })} /> PDI customer ({settings.data?.defaultCustomer ? settings.data.defaultCustomer.companyName ?? `${settings.data.defaultCustomer.firstName} ${settings.data.defaultCustomer.lastName}` : "not set"})</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={form.customerMode === "other"} onChange={() => set({ customerMode: "other" })} /> Fleet buyer / other</label>
                </div>
                {form.customerMode === "other" && <WorkshopPicker label="Customer" hideLabel endpoint="/customers" collection="customers" formatLabel={customerLabel} renderOption={customerOption} value={form.customerId} onChange={customerId => set({ customerId })} />}
                {show("customer") && <p className="text-xs text-destructive">{errors.customer}</p>}
              </div>
              <PdiField label="Remarks">
                <textarea className={`${pdiInput} h-20 py-2`} maxLength={5000} value={form.remarks} onChange={event => set({ remarks: event.target.value })} />
              </PdiField>
            </div>
          </SectionCard>

          <SectionCard icon={<ClipboardList />} title="Defects detected" note="At least one line; estimates fill from the PDI defect master when set for the model">
            <DefectsGrid value={defects} onChange={setDefects} vehicleId={vehicle?.id} showErrors={touched} />
          </SectionCard>

          <SectionCard icon={<Disc3 />} title="Tyres and battery" note="Saved to the vehicle">
            <TyreBatteryFields tyres={tyres} onTyres={setTyres} batteryMakeId={form.batteryMakeId} batteryNumber={form.batteryNumber} onBattery={value => set(value)} sizes={sizes} />
          </SectionCard>
        </div>

        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PDI summary</p>
              <p className="mt-1 font-mono text-lg font-semibold">{form.pdiRegistration || "——————"}</p>
              <p className="text-xs text-muted-foreground">{vehicle ? vehicle.catalogue?.description ?? vehicle.model : "No vehicle chosen"}</p>
            </div>
            <ul className="space-y-2 text-sm">
              {checklist.map(item => (
                <li key={item.label} className="flex items-center gap-2">
                  {item.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleDashed className="size-4 text-muted-foreground" />}
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
              <Row label="Defect lines" value={String(defects.length)} />
              <Row label="Spare" value={formatMoney(totals.spare)} />
              <Row label="Oil" value={formatMoney(totals.oil)} />
              <Row label="Labour" value={formatMoney(totals.labour)} />
              <Row label="Estimated total" value={formatMoney(totals.total)} strong />
            </dl>
            {touched && missing.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-destructive/5 p-3 text-xs text-destructive" role="alert">
                {missing.map(message => <li key={message}>{message}</li>)}
              </ul>
            )}
            <Button className="w-full" disabled={open.isPending || !branchId} onClick={submit}>{open.isPending ? "Opening…" : "Open PDI job card"}</Button>
          </div>
        </aside>
      </div>

      {creatingVehicle && (
        <NewVehicleDialog
          open
          vin={vinSearch.trim().toUpperCase()}
          onClose={() => setCreatingVehicle(false)}
          onCreated={created => { setCreatingVehicle(false); chooseVehicle(created); }}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0"><p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 break-words font-medium text-foreground">{value}</p></div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn("tabular-nums", strong && "text-base font-bold text-foreground")}>{value}</dd></div>;
}
