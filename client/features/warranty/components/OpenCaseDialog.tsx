"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useJobCards } from "@/features/job-cards";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { useOpenWarrantyCase } from "../hooks/use-warranty";
import { COVERAGE_LABELS, COVERAGE_TONES, fmtDate } from "../lib/warranty-format";
import { Pill } from "./ui";

/**
 * Opens a case for a job card manually — for example after verifying the coverage of a
 * vehicle that was UNKNOWN when the job card was created.
 */
export function OpenCaseDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const open = useOpenWarrantyCase();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [complaint, setComplaint] = useState("");
  const debounced = useDebouncedValue(search.trim(), 350);
  const { data, isFetching } = useJobCards({ search: debounced, limit: 8 }, debounced.length >= 2);
  const results = (data?.jobCards ?? []).filter((j) => j.vehicleId);

  return (
    <ModalFame isOpen onClose={onClose} title="Open warranty case">
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">
          Cases open automatically for vehicles under warranty. Open one manually when coverage was unknown at check-in and you have verified it.
        </p>
        <Field label="Job card">
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search job number, VIN, plate or customer" autoFocus />
        </Field>
        {debounced.length >= 2 && (
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {isFetching && results.length === 0 && <li className="p-3 text-sm text-slate-400">Searching…</li>}
            {!isFetching && results.length === 0 && <li className="p-3 text-sm text-slate-400">No job cards with a vehicle match.</li>}
            {results.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(j.id);
                    setComplaint(j.description);
                  }}
                  className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-slate-50", selected === j.id && "bg-slate-100")}
                >
                  <span className="font-mono text-xs font-semibold">{j.jobNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    {j.vehicle?.model} · {j.vehicle?.vin} · {fmtDate(j.createdAt)}
                  </span>
                  {j.warrantyStatusAtCreation && <Pill status={COVERAGE_LABELS[j.warrantyStatusAtCreation]} tone={COVERAGE_TONES[j.warrantyStatusAtCreation]} />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <Field label="Complaint">
            <textarea className={cn(inputCls, "h-20 py-2")} value={complaint} onChange={(e) => setComplaint(e.target.value)} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected || open.isPending}
            onClick={() =>
              selected &&
              open.mutate(
                { jobCardId: selected, complaint: complaint.trim() || undefined },
                { onSuccess: (c) => router.push(`/warranty/${c.id}`) },
              )
            }
          >
            {open.isPending ? "Opening…" : "Open case"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
