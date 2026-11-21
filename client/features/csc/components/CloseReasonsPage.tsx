"use client";
import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { DataTable, type Column } from "@/components/ui/table-components/DataTable";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Pill } from "@/features/warranty/components/ui";
import { cn } from "@/lib/utils";
import { useDeleteReason, useReasons, useSaveReason } from "../hooks/use-csc";
import { CLOSURE_TYPE, CSC_PERMISSIONS } from "../lib/csc.logic";
import type { CscClosureType, CscReason } from "../types/csc.types";
import { CscNav, inputCls, labelCls, Toggle } from "./csc-ui";

const CODE = /^[A-Z0-9-]{1,10}$/;

function ReasonForm({ reason, nextCode, onDone }: { reason: CscReason | null; nextCode: string; onDone: () => void }) {
  const save = useSaveReason(reason?.id);
  const [code, setCode] = useState(reason?.code ?? nextCode);
  const [description, setDescription] = useState(reason?.description ?? "");
  const [shortDescription, setShortDescription] = useState(reason?.shortDescription ?? "");
  const [closureType, setClosureType] = useState<CscClosureType>(reason?.closureType ?? "PARTIAL");
  const [active, setActive] = useState(reason?.active ?? true);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason && !CODE.test(code)) return setProblem("Use up to 10 capital letters, digits or dashes, e.g. R0009");
    if (!description.trim()) return setProblem("Enter the reason description");
    save.mutate(
      { ...(reason ? {} : { code }), description: description.trim(), shortDescription: shortDescription.trim() || null, closureType, active },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <label className="block">
          <span className={labelCls}>Reason code</span>
          <input className={cn(inputCls, "font-mono uppercase")} value={code} maxLength={10} disabled={!!reason} onChange={(event) => setCode(event.target.value.toUpperCase())} />
        </label>
        <label className="block">
          <span className={labelCls}>Short description</span>
          <input className={cn(inputCls, "uppercase")} value={shortDescription} maxLength={20} placeholder="e.g. NOTAVAIL" onChange={(event) => setShortDescription(event.target.value.toUpperCase())} />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Reason description</span>
        <input className={inputCls} value={description} maxLength={120} placeholder="e.g. Presently customer not available" onChange={(event) => setDescription(event.target.value)} />
      </label>
      <fieldset>
        <legend className={labelCls}>Closure type</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["PARTIAL", "FINAL"] as const).map((type) => (
            <label key={type} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", closureType === type ? "border-primary bg-primary/5" : "border-slate-200 hover:bg-slate-50")}>
              <input type="radio" name="closureType" className="mt-1" checked={closureType === type} onChange={() => setClosureType(type)} />
              <span>
                <span className="block text-sm font-medium text-slate-800">{CLOSURE_TYPE[type].label}</span>
                <span className="block text-xs text-slate-500">{CLOSURE_TYPE[type].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {reason && <Toggle checked={active} onChange={setActive} label="Active" description="Inactive reasons stay on past cases but can't be chosen." />}
      <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
        {problem && <span className="mr-auto text-sm font-medium text-red-600" role="alert">{problem}</span>}
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={save.isPending} className="gap-1.5">
          {save.isPending && <Loader2 className="size-4 animate-spin" />} {reason ? "Save changes" : "Add reason"}
        </Button>
      </div>
    </form>
  );
}

/** Next free code in the R#### series. */
function nextReasonCode(reasons: CscReason[]) {
  const numbers = reasons.map((reason) => /^R(\d{4})$/.exec(reason.code)?.[1]).filter((value): value is string => !!value).map(Number);
  return `R${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, "0")}`;
}

/** Causes for CSC follow-up closure: the reason codes used to close a follow-up or a case. */
export function CloseReasonsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(CSC_PERMISSIONS.MASTER_UPDATE);
  const reasons = useReasons(true);
  const remove = useDeleteReason();
  const [editing, setEditing] = useState<CscReason | null | "new">(null);
  const [confirm, setConfirm] = useState<CscReason | null>(null);

  const columns = useMemo<Column<CscReason>[]>(
    () => [
      { header: "Code", render: (row) => <span className="font-mono font-semibold text-slate-900">{row.code}</span> },
      {
        header: "Description",
        render: (row) => (
          <div>
            <p className="text-slate-800">{row.description}</p>
            {row.shortDescription && <p className="font-mono text-xs text-slate-400">{row.shortDescription}</p>}
          </div>
        ),
      },
      { header: "Closure type", render: (row) => <Pill status={CLOSURE_TYPE[row.closureType].label} tone={CLOSURE_TYPE[row.closureType].tone} /> },
      { header: "Status", render: (row) => <Pill status={row.active ? "Active" : "Inactive"} tone={row.active ? "emerald" : "gray"} /> },
      { header: "Used on", render: (row) => <span className="tabular-nums text-slate-600">{row.used ? `${row.used} case${row.used === 1 ? "" : "s"}` : "—"}</span> },
      {
        header: <span className="sr-only">Actions</span>,
        render: (row) =>
          canEdit ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${row.code}`} onClick={() => setEditing(row)}><Pencil className="size-4" /></Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Delete ${row.code}`}
                disabled={row.used > 0}
                title={row.used > 0 ? "Used on cases: deactivate it instead" : "Delete"}
                onClick={() => setConfirm(row)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader
        title="Causes for CSC follow-up closure"
        description="Reasons for closing a follow-up. A final closure ends the case; a follow-up closure ends only the current call and the case moves on."
        actions={canEdit ? <Button size="sm" className="gap-1.5" onClick={() => setEditing("new")}><Plus className="size-4" /> Add reason</Button> : undefined}
      />
      <CscNav />
      {reasons.isError ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Could not load the reasons.
          <Button variant="outline" size="sm" onClick={() => void reasons.refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable columns={columns} data={reasons.data ?? []} isLoading={reasons.isLoading} rowKey={(row) => row.id} emptyMessage="No closure reasons yet." />
      )}

      <ModalFame isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add closure reason" : `Edit ${editing?.code ?? ""}`}>
        {editing !== null && <ReasonForm reason={editing === "new" ? null : editing} nextCode={nextReasonCode(reasons.data ?? [])} onDone={() => setEditing(null)} />}
      </ModalFame>
      <ModalFame isOpen={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm?.code ?? ""}?`} description="Only reasons never used on a case can be deleted.">
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>Keep it</Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => confirm && remove.mutate(confirm.id, { onSuccess: () => setConfirm(null) })}>
            {remove.isPending && <Loader2 className="size-4 animate-spin" />} Delete
          </Button>
        </div>
      </ModalFame>
    </div>
  );
}
