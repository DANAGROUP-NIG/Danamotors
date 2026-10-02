"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Car, ChevronDown, ChevronUp, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getJobCardsRequest, jobCardKeys } from "@/features/job-cards";
import { cn } from "@/lib/utils";
import { PartPicker } from "./PartPicker";
import { useCreateIndent } from "../hooks/use-indent-mutations";
import { useIndentAbilities } from "../hooks/use-indent-abilities";
import { MOBIS_ORDER_MODE_LABELS, fmtCurrency } from "../lib/indent-status";
import type { CreateIndentPayload, PartSearchResult } from "../types/indent.types";

type DraftLine = {
  key: string;
  part: PartSearchResult;
  partFlag: string;
  urgentQuantity: string;
  stockQuantity: string;
  stockOrderQuantity: string;
  mobisOrderMode: "" | "AIR" | "COURIER";
  jobCardId: string;
  jobNumber: string;
  registrationNumber: string;
  vin: string;
  vehicleModel: string;
  remarks: string;
  showVehicle: boolean;
};

const toInt = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

export function IndentCreateForm() {
  const router = useRouter();
  const create = useCreateIndent();
  const branches = useBranchStore((s) => s.branches);
  const { user, hasPermission } = useAuth();
  const { crossBranch } = useIndentAbilities();

  const [requestingBranchId, setRequestingBranchId] = useState<string>(crossBranch ? "" : (user?.branchId ?? ""));
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [authorisedBy, setAuthorisedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canReadJobCards = hasPermission("jobcard:read");
  const jobCardParams = { branchId: requestingBranchId, limit: 100 };
  const { data: jobCardData } = useQuery({
    queryKey: jobCardKeys.list(jobCardParams),
    queryFn: () => getJobCardsRequest(jobCardParams),
    enabled: canReadJobCards && !!requestingBranchId,
    retry: false,
  });
  const jobCards = canReadJobCards && requestingBranchId ? (jobCardData?.jobCards ?? []) : [];
  const branchesLocked = lines.length > 0;

  const activeBranches = branches.filter((b) => b.isActive !== false);
  const requestingName = branches.find((b) => b.id === requestingBranchId)?.name ?? "Your branch";

  const totals = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const l of lines) {
      const q = lineQty(l);
      qty += q;
      amount += q * l.part.unitRate;
    }
    return { qty, amount };
  }, [lines]);

  const lineQty = (l: DraftLine) => toInt(l.urgentQuantity) + toInt(l.stockQuantity) + toInt(l.stockOrderQuantity);

  function update(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addPart(part: PartSearchResult) {
    setLines((prev) => [
      ...prev,
      {
        key: `${part.id}-${Date.now()}`,
        part,
        partFlag: part.partFlag ?? "O",
        urgentQuantity: "",
        stockQuantity: "",
        stockOrderQuantity: "1",
        mobisOrderMode: "",
        jobCardId: "",
        jobNumber: "",
        registrationNumber: "",
        vin: "",
        vehicleModel: "",
        remarks: "",
        showVehicle: false,
      },
    ]);
  }

  function pickJobCard(key: string, jobCardId: string) {
    const jc = jobCards.find((j) => j.id === jobCardId);
    update(key, {
      jobCardId,
      jobNumber: jc?.jobNumber ?? "",
      registrationNumber: jc?.vehicle?.registrationNumber ?? "",
      vin: jc?.vehicle?.vin ?? "",
      vehicleModel: jc?.vehicle?.model ?? "",
    });
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!requestingBranchId) e.requestingBranchId = "Select the requesting branch";
    if (!sourceBranchId) e.sourceBranchId = "Select where the stock comes from";
    if (requestingBranchId && requestingBranchId === sourceBranchId)
      e.sourceBranchId = "The supplying branch must be different";
    if (lines.length === 0) e.lines = "Add at least one part";
    for (const l of lines) {
      if (lineQty(l) === 0) e[l.key] = "Enter an urgent (vehicle), urgent (stock) or stock order quantity";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function onSubmit(submit: boolean) {
    if (!validate()) return;
    const opt = (v: string) => v.trim() || undefined;
    const payload: CreateIndentPayload = {
      requestingBranchId,
      sourceBranchId,
      authorisedBy: opt(authorisedBy),
      remarks: opt(remarks),
      submit,
      lines: lines.map((l) => ({
        partId: l.part.id,
        partFlag: opt(l.partFlag),
        urgentQuantity: toInt(l.urgentQuantity) || undefined,
        stockQuantity: toInt(l.stockQuantity) || undefined,
        stockOrderQuantity: toInt(l.stockOrderQuantity) || undefined,
        mobisOrderMode: l.mobisOrderMode || undefined,
        jobCardId: l.jobCardId || undefined,
        jobNumber: opt(l.jobNumber),
        registrationNumber: opt(l.registrationNumber),
        vin: opt(l.vin),
        vehicleModel: opt(l.vehicleModel),
        remarks: opt(l.remarks),
      })),
    };
    create.mutate(payload, { onSuccess: (indent) => router.push(`/transfers/indents/${indent.id}`) });
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <Link href="/transfers" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Stock Transfers
      </Link>
      <PageHeader
        title="New indent"
        description="Request parts from CPD or another branch. Rates and stock are filled in from Part Master."
      />

      {/* ── Header ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Requesting branch" error={errors.requestingBranchId}>
            {crossBranch ? (
              <select
                className={inputCls}
                value={requestingBranchId}
                disabled={branchesLocked}
                onChange={(e) => setRequestingBranchId(e.target.value)}
              >
                <option value="">Select branch</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className={inputCls} readOnly value={requestingName} />
            )}
          </Field>
          <Field label="Supply from (CPD or branch)" error={errors.sourceBranchId}>
            <select
              className={inputCls}
              value={sourceBranchId}
              disabled={branchesLocked}
              onChange={(e) => setSourceBranchId(e.target.value)}
            >
              <option value="">Select supplying branch</option>
              {activeBranches
                .filter((b) => b.id !== requestingBranchId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Authorised by (optional)">
            <input
              className={inputCls}
              placeholder="e.g. SM"
              value={authorisedBy}
              maxLength={60}
              onChange={(e) => setAuthorisedBy(e.target.value)}
            />
          </Field>
          <Field label="Remarks (optional)">
            <input
              className={inputCls}
              placeholder="e.g. Urgent vehicle order"
              value={remarks}
              maxLength={500}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* ── Lines ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Package className="size-4" /> Parts
          </div>
          <div className="w-full sm:w-96">
            <PartPicker
              requestingBranchId={requestingBranchId || undefined}
              sourceBranchId={sourceBranchId || undefined}
              onSelect={addPart}
              disabled={!sourceBranchId || !requestingBranchId}
              placeholder={
                sourceBranchId && requestingBranchId
                  ? "Add a part: search number or name…"
                  : "Choose both branches, then add parts…"
              }
            />
          </div>
        </div>
        {errors.lines && <p className="mb-3 text-sm text-red-500">{errors.lines}</p>}
        {branchesLocked && (
          <p className="mb-3 text-sm text-muted-foreground">Remove all parts to change the branches.</p>
        )}

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-muted-foreground">
            No parts yet. Search above to add the first one.
          </p>
        ) : (
          <div className="space-y-3">
            {lines.map((l, index) => {
              const qty = lineQty(l);
              const short = sourceBranchId && qty > l.part.sourceAvailable;
              return (
                <div key={l.key} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-400">Line {index + 1}</p>
                      <p className="font-mono text-sm font-medium text-slate-800">{l.part.partNumber}</p>
                      <p className="text-sm text-slate-500">{l.part.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {l.part.priceCategoryCode ? `Category ${l.part.priceCategoryCode} · ` : ""}
                        {l.part.uom} · {fmtCurrency(l.part.unitRate)} each
                        {l.part.binLocation ? ` · Bin ${l.part.binLocation}` : ""}
                        {` · Your stock ${l.part.requestingStock}`}
                        {sourceBranchId ? ` · Available at supplier ${l.part.sourceAvailable}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <Field label="Urgent (vehicle)">
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        value={l.urgentQuantity}
                        onChange={(e) => update(l.key, { urgentQuantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Urgent (stock)">
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        value={l.stockQuantity}
                        onChange={(e) => update(l.key, { stockQuantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Stock order (15 days)">
                      <input
                        type="number"
                        min={0}
                        className={inputCls}
                        value={l.stockOrderQuantity}
                        onChange={(e) => update(l.key, { stockOrderQuantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Part flag">
                      <input
                        className={inputCls}
                        maxLength={2}
                        value={l.partFlag}
                        onChange={(e) => update(l.key, { partFlag: e.target.value.toUpperCase() })}
                      />
                    </Field>
                    <Field label="If unavailable, order from Mobis by">
                      <select
                        className={inputCls}
                        value={l.mobisOrderMode}
                        onChange={(e) => update(l.key, { mobisOrderMode: e.target.value as DraftLine["mobisOrderMode"] })}
                      >
                        <option value="">Not set</option>
                        {Object.entries(MOBIS_ORDER_MODE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid gap-1.5">
                      <span className="text-sm font-semibold">Amount</span>
                      <p className="flex h-10 items-center text-sm font-medium text-slate-800">
                        {fmtCurrency(qty * l.part.unitRate)}
                      </p>
                    </div>
                  </div>
                  {errors[l.key] && <p className="mt-2 text-sm text-red-500">{errors[l.key]}</p>}
                  {short && (
                    <p className="mt-2 text-sm text-amber-700">
                      The supplier has {l.part.sourceAvailable} available. The rest will go on back order.
                    </p>
                  )}

                  <button
                    type="button"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    onClick={() => update(l.key, { showVehicle: !l.showVehicle })}
                  >
                    <Car className="size-3.5" />
                    {l.registrationNumber || l.jobNumber
                      ? `Vehicle: ${[l.registrationNumber, l.jobNumber && `Job ${l.jobNumber}`].filter(Boolean).join(" · ")}`
                      : "Add vehicle / job card (for urgent orders)"}
                    {l.showVehicle ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </button>

                  <div className={cn("mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5", !l.showVehicle && "hidden")}>
                    {jobCards.length > 0 && (
                      <Field label="Job card">
                        <select className={inputCls} value={l.jobCardId} onChange={(e) => pickJobCard(l.key, e.target.value)}>
                          <option value="">None</option>
                          {jobCards.map((jc) => (
                            <option key={jc.id} value={jc.id}>
                              {jc.jobNumber}
                              {jc.vehicle?.registrationNumber ? ` · ${jc.vehicle.registrationNumber}` : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    <Field label="Job no.">
                      <input
                        className={inputCls}
                        value={l.jobNumber}
                        maxLength={20}
                        disabled={!!l.jobCardId}
                        onChange={(e) => update(l.key, { jobNumber: e.target.value })}
                      />
                    </Field>
                    <Field label="Reg no.">
                      <input
                        className={inputCls}
                        value={l.registrationNumber}
                        maxLength={15}
                        disabled={!!l.jobCardId}
                        onChange={(e) => update(l.key, { registrationNumber: e.target.value.toUpperCase() })}
                      />
                    </Field>
                    <Field label="VIN">
                      <input
                        className={inputCls}
                        value={l.vin}
                        maxLength={20}
                        disabled={!!l.jobCardId}
                        onChange={(e) => update(l.key, { vin: e.target.value.toUpperCase() })}
                      />
                    </Field>
                    <Field label="Model">
                      <input
                        className={inputCls}
                        value={l.vehicleModel}
                        maxLength={40}
                        disabled={!!l.jobCardId}
                        onChange={(e) => update(l.key, { vehicleModel: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">
          {lines.length} {lines.length === 1 ? "part" : "parts"} · {totals.qty} units ·{" "}
          <span className="font-semibold text-slate-800">{fmtCurrency(totals.amount)}</span>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={create.isPending} onClick={() => onSubmit(false)}>
            Save draft
          </Button>
          <Button type="button" disabled={create.isPending} onClick={() => onSubmit(true)}>
            {create.isPending ? "Submitting…" : "Submit indent"}
          </Button>
        </div>
      </div>
    </div>
  );
}
