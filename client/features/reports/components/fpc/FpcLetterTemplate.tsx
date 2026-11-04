"use client";

import { useRef, useState } from "react";
import { FileSignature, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { REPORT_SETTINGS_PERMISSION } from "@/features/auth/roles";
import { useReportSettings, useSaveReportSettings } from "../../hooks/use-reports";
import { fillLetter, letterValues, mailableRows } from "../../lib/fpc-letter";
import type { ReportResponse, ReportRow } from "../../types";

const SAMPLE: ReportRow = {
  customer: "Chinedu Okafor",
  customerAddress: "12 Allen Avenue, Ikeja, Lagos",
  registration: "LND-123-AB",
  vin: "KNAKU813DC5214595",
  model: "Sorento",
  variant: "2.4 EX",
  bulletin: "KC13-14-P010-XM",
  subject: "Sorento (XM) fuel pump plate cover replacement",
  measures: "Countermeasure for all customers visiting the workshop",
  branchName: "Kia Plaza",
  branchAddress: "Plot 5, Victoria Island, Lagos",
  branchPhone: "0700 000 0000",
  branchEmail: "service@example.com",
};

function TemplateEditor({ sample, onClose }: { sample: ReportRow; onClose: () => void }) {
  const settings = useReportSettings();
  const save = useSaveReportSettings();
  const [text, setText] = useState(settings.data?.fpcLetterTemplate ?? "");
  const area = useRef<HTMLTextAreaElement>(null);

  function insert(name: string) {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText((t) => t + token);
    const start = el.selectionStart;
    const next = text.slice(0, start) + token + text.slice(el.selectionEnd);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  if (!settings.data) return <p className="text-sm text-slate-500">Loading the template…</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5" aria-label="Placeholders">
        {settings.data.fpcLetterPlaceholders.map((name) => (
          <button key={name} type="button" onClick={() => insert(name)} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-700 hover:border-primary hover:bg-white">
            {`{{${name}}}`}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Template</span>
          <textarea
            ref={area}
            className="min-h-[22rem] w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-ring"
            value={text}
            maxLength={5000}
            onChange={(event) => setText(event.target.value)}
          />
          <span className="text-right text-xs tabular-nums text-slate-500">{text.length}/5000</span>
        </label>
        <div className="grid content-start gap-1.5">
          <span className="text-sm font-semibold">Preview</span>
          <div className="max-h-[24rem] overflow-auto whitespace-pre-line rounded-md border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-inner">
            {fillLetter(text, letterValues(sample, new Date()))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="mr-auto gap-1.5"
          disabled={save.isPending || settings.data.fpcLetterIsDefault}
          onClick={() => save.mutate({ fpcLetterTemplate: null }, { onSuccess: (data) => setText(data.fpcLetterTemplate) })}
        >
          <RotateCcw className="size-4" /> Reset to default
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={save.isPending || text.trim().length < 20} onClick={() => save.mutate({ fpcLetterTemplate: text }, { onSuccess: onClose })}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save template
        </Button>
      </div>
    </div>
  );
}

/** Screen strip above the FPC vehicles table: how letters print, and the template editor. */
export function FpcLetterToolbar({ data }: { data: ReportResponse }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const canEdit = isSuperAdmin || hasPermission(REPORT_SETTINGS_PERMISSION);
  const mailable = mailableRows(data.rows);
  const notRegistered = data.totals.notRegistered ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-sm">
      <FileSignature className="size-4 text-slate-500" aria-hidden />
      <p className="min-w-0 flex-1 text-slate-600">
        Letters and labels go to <span className="font-semibold text-slate-800">{mailable.length.toLocaleString("en-NG")}</span> registered vehicle(s) with a customer.
        {notRegistered > 0 && ` ${notRegistered.toLocaleString("en-NG")} VIN(s) not registered yet appear in the list only.`} Tick List, Letters or Labels under Options, then Print.
      </p>
      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Letter template
        </Button>
      )}
      <ModalFame isOpen={open} onClose={() => setOpen(false)} title="FPC letter template" size="wide">
        {open && <TemplateEditor sample={mailable[0] ?? SAMPLE} onClose={() => setOpen(false)} />}
      </ModalFame>
    </div>
  );
}
