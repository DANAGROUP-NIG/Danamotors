"use client";

import { useRef, useState } from "react";
import { FileSignature, Loader2, RotateCcw, Tags } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { REPORT_SETTINGS_PERMISSION } from "@/features/auth/roles";
import { useReportSettings, useSaveReportSettings } from "../../hooks/use-reports";
import { fillLetter } from "../../lib/fpc-letter";
import { psfLetterValues } from "../../lib/psf-letter";
import type { ReportResponse, ReportRow } from "../../types";
import { COMPANY_NAME } from "../ReportPrintLayout";

const str = (row: ReportRow, key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));
const mailable = (rows: ReportRow[]) => rows.filter((row) => row.mailable === true);

const SAMPLE: ReportRow = {
  customer: "Mx. Ifeoma Nwosu",
  customerAddress: "14 Allen Avenue, Ikeja, Lagos",
  registration: "LSL-901PF",
  registrations: "LSL-901PF",
  model: "Rio",
  jobNumber: "DM-PSF-7",
  deliveredAt: "2026-02-10T16:00:00.000Z",
  serviceType: "Running repair",
  branchName: "Main Branch",
  branchAddress: "1 Dana Road, Ikeja, Lagos",
  branchPhone: "0700 000 0000",
  branchEmail: "service@example.com",
};

/** Print-only letters, one A4 page per customer with an address, from the PSF letter template in report settings. */
export function PsfLetters({ data }: { data: ReportResponse }) {
  const settings = useReportSettings();
  const rows = mailable(data.rows);
  if (!settings.data || rows.length === 0) return null;
  const today = new Date();
  return (
    <div className="hidden text-black print:block">
      {rows.map((row) => {
        const values = psfLetterValues(row, today);
        return (
          <article key={str(row, "customerId")} className="break-before-page px-[6mm] pt-[4mm] text-[11pt] leading-relaxed">
            <header className="flex items-start justify-between border-b-2 border-black pb-2">
              <div>
                <p className="text-lg font-bold tracking-tight">{COMPANY_NAME}</p>
                <p className="text-[9pt]">{values.branch}</p>
                <p className="text-[9pt]">{values.branchAddress}</p>
                <p className="text-[9pt]">{[values.branchPhone && `Tel: ${values.branchPhone}`, values.branchEmail].filter(Boolean).join(" · ")}</p>
              </div>
              <p className="text-[10pt]">{values.date}</p>
            </header>
            <address className="mb-6 mt-6 not-italic">
              <p className="font-semibold">{values.customer}</p>
              <p className="whitespace-pre-line">{values.customerAddress.replace(/, /g, "\n")}</p>
            </address>
            <div className="whitespace-pre-line">{fillLetter(settings.data.psfLetterTemplate, values)}</div>
          </article>
        );
      })}
    </div>
  );
}

/** Print-only A4 sheet of 3 × 8 address labels (63.5 × 38.1 mm). */
export function PsfMailingLabels({ data }: { data: ReportResponse }) {
  if (data.rows.length === 0) return null;
  return (
    <div className="hidden text-black print:block">
      <div className="grid grid-cols-3 gap-x-[2.5mm]">
        {data.rows.map((row) => (
          <div key={str(row, "id")} className="flex h-[38.1mm] break-inside-avoid flex-col justify-center overflow-hidden px-[4mm] text-[9.5pt] leading-snug">
            <p className="font-semibold">{str(row, "customer")}</p>
            <p className="whitespace-pre-line">{str(row, "customerAddress").replace(/, /g, "\n")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateEditor({ sample, onClose }: { sample: ReportRow; onClose: () => void }) {
  const settings = useReportSettings();
  const save = useSaveReportSettings();
  const [text, setText] = useState(settings.data?.psfLetterTemplate ?? "");
  const area = useRef<HTMLTextAreaElement>(null);

  function insert(name: string) {
    const el = area.current;
    const token = `{{${name}}}`;
    if (!el) return setText((current) => current + token);
    const start = el.selectionStart;
    setText(text.slice(0, start) + token + text.slice(el.selectionEnd));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  if (!settings.data) return <p className="text-sm text-slate-500">Loading the template…</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-1.5" aria-label="Placeholders">
        {settings.data.psfLetterPlaceholders.map((name) => (
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
            {fillLetter(text, psfLetterValues(sample, new Date()))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="mr-auto gap-1.5"
          disabled={save.isPending || settings.data.psfLetterIsDefault}
          onClick={() => save.mutate({ psfLetterTemplate: null }, { onSuccess: (data) => setText(data.psfLetterTemplate) })}
        >
          <RotateCcw className="size-4" /> Reset to default
        </Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={save.isPending || text.trim().length < 20} onClick={() => save.mutate({ psfLetterTemplate: text }, { onSuccess: onClose })}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save template
        </Button>
      </div>
    </div>
  );
}

/** Screen strip above the letter list: how many letters print, and the template editor. */
export function PsfLetterToolbar({ data }: { data: ReportResponse }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const canEdit = isSuperAdmin || hasPermission(REPORT_SETTINGS_PERMISSION);
  const letters = mailable(data.rows);
  const noAddress = data.totals.noAddress ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm shadow-sm">
      <FileSignature className="size-4 text-slate-500" aria-hidden />
      <p className="min-w-0 flex-1 text-slate-600">
        Print makes <span className="font-semibold text-slate-800">{letters.length.toLocaleString("en-NG")}</span> letter(s), one A4 page per customer.
        {noAddress > 0 && ` ${noAddress.toLocaleString("en-NG")} customer(s) without an address are left out; update their profile to include them.`}
      </p>
      {canEdit && <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Letter template</Button>}
      <ModalFame isOpen={open} onClose={() => setOpen(false)} title="Follow-up letter template" size="wide">
        {open && <TemplateEditor sample={letters[0] ?? SAMPLE} onClose={() => setOpen(false)} />}
      </ModalFame>
    </div>
  );
}

/** Screen strip above the mailing list: what Print produces. */
export function MailingToolbar({ data }: { data: ReportResponse }) {
  const noAddress = data.totals.noAddress ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
      <Tags className="size-4 text-slate-500" aria-hidden />
      <p className="min-w-0 flex-1">
        {data.rows.length.toLocaleString("en-NG")} address(es). Choose <span className="font-medium text-slate-800">Print as: Labels</span> for an A4 sheet of 24 labels per page, or Document for a list.
        {noAddress > 0 && ` ${noAddress.toLocaleString("en-NG")} customer(s) have no address and are left out.`}
      </p>
    </div>
  );
}
