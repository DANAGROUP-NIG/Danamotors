"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useLabelPrinters, usePrintLabels } from "../hooks/use-labels";
import { PrinterLine } from "./label-parts";
import { NumberInput } from "@/components/forms/NumberInput";

/** "Print label" from a part's page: copies of its label on the branch's label printer. */
export function PrintLabelDialog({
  part,
  branchId,
  onClose,
}: {
  part: { id: string; partNumber: string; name: string };
  /** The branch to print at (cross-branch users); otherwise the user's own. */
  branchId?: string;
  onClose: () => void;
}) {
  const [copies, setCopies] = useState("1");
  const printers = useLabelPrinters(branchId);
  const print = usePrintLabels();
  const n = Math.floor(Number(copies) || 0);
  const valid = n >= 1 && n <= 100;

  return (
    <ModalFame isOpen onClose={onClose} title={`Print label: ${part.partNumber}`}>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{part.name}</p>
        <PrinterLine printers={printers.data} loading={printers.isLoading} />
        <Field label="Copies" required error={valid ? undefined : "1 to 100"}>
          <NumberInput min={1} max={100} className={inputCls} value={copies} onChange={(e) => setCopies(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            className="gap-1.5"
            disabled={!valid || print.isPending}
            onClick={() => print.mutate({ branchId, labels: [{ partId: part.id, copies: n }] }, { onSuccess: onClose })}
          >
            <Printer className="size-4" /> Print {valid ? n : ""} label{n === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
