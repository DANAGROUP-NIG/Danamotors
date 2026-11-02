"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Printer, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalFame from "@/components/modals/ModalFame";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CAMPAIGN_PERMISSIONS } from "@/features/auth/roles";
import { recordPrintedContactsRequest } from "@/features/campaigns/api/campaign.api";
import { AlertBanner } from "@/features/warranty/components/ui";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { useReportSettings } from "../../hooks/use-reports";
import { fillLetter, letterValues, mailableRows } from "../../lib/fpc-letter";
import type { ReportResponse, ReportRow } from "../../types";
import { COMPANY_NAME } from "../ReportPrintLayout";

const str = (row: ReportRow, key: string) => (row[key] === null || row[key] === undefined ? "" : String(row[key]));

/** One row per campaign vehicle: visit lists can hold a vehicle twice, but it gets one letter. */
export function uniqueVehicles<Row extends ReportRow>(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = str(row, "campaignVehicleId");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Who gets which contact when "record as called" is ticked: letters (and labels) by post, the list by phone. */
export function printedContacts(rows: ReportRow[], options: Record<string, string>) {
  const vehicles = uniqueVehicles(rows).filter((row) => row.registered === true);
  const byPost = options.printLetters === "true" || options.printLabels === "true" ? mailableRows(vehicles) : [];
  const posted = new Set(byPost.map((row) => str(row, "campaignVehicleId")));
  const byPhone = options.printList === "true" ? vehicles.filter((row) => !posted.has(str(row, "campaignVehicleId"))) : [];
  return { letter: byPost.map((row) => str(row, "campaignVehicleId")), phone: byPhone.map((row) => str(row, "campaignVehicleId")) };
}

/** Print-only letters, one A4 page per vehicle, from the letter template in report settings. */
export function FpcLetters({ data }: { data: ReportResponse }) {
  const settings = useReportSettings();
  const rows = mailableRows(uniqueVehicles(data.rows));
  const today = new Date();
  if (!settings.data || rows.length === 0) return null;
  return (
    <div className="hidden text-black print:block">
      {rows.map((row) => {
        const values = letterValues(row, today);
        return (
          <article key={str(row, "campaignVehicleId")} className="break-before-page px-[6mm] pt-[4mm] text-[11pt] leading-relaxed">
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
            <div className="whitespace-pre-line">{fillLetter(settings.data.fpcLetterTemplate, values)}</div>
          </article>
        );
      })}
    </div>
  );
}

/** Print-only address labels: an A4 sheet of 3 × 8 labels (63.5 × 38.1 mm). */
export function FpcLabels({ data }: { data: ReportResponse }) {
  const rows = mailableRows(uniqueVehicles(data.rows));
  if (rows.length === 0) return null;
  return (
    <div className="hidden break-before-page text-black print:block">
      <div className="grid grid-cols-3 gap-x-[2.5mm]">
        {rows.map((row) => (
          <div key={str(row, "campaignVehicleId")} className="flex h-[38.1mm] break-inside-avoid flex-col justify-center overflow-hidden px-[4mm] text-[9.5pt] leading-snug">
            <p className="font-semibold">{str(row, "customer")}</p>
            <p className="whitespace-pre-line">{str(row, "customerAddress").replace(/, /g, "\n")}</p>
            <p className="mt-0.5 font-mono text-[7.5pt]">
              {str(row, "registration")} · {str(row, "bulletin")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Print button of the FPC vehicles report. With "record as called" ticked on the
 * "to be called" list it asks for confirmation with the count, records one contact per
 * vehicle printed (letter by post, phone for the call list), then prints.
 */
export function FpcPrintButton({ data, options, disabled, print }: { data: ReportResponse | undefined; options: Record<string, string>; disabled: boolean; print: () => void }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const canRecord = isSuperAdmin || hasPermission(CAMPAIGN_PERMISSIONS.VEHICLE_UPDATE);
  const recording = canRecord && options.show === "TO_BE_CALLED" && options.recordCalled === "true";
  const contacts = data ? printedContacts(data.rows, options) : { letter: [], phone: [] };
  const total = contacts.letter.length + contacts.phone.length;

  async function recordAndPrint() {
    setSaving(true);
    try {
      const results = await Promise.all([
        contacts.letter.length ? recordPrintedContactsRequest({ campaignVehicleIds: contacts.letter, channel: "LETTER" }) : null,
        contacts.phone.length ? recordPrintedContactsRequest({ campaignVehicleIds: contacts.phone, channel: "PHONE" }) : null,
      ]);
      const recorded = results.reduce((sum, r) => sum + (r?.recorded ?? 0), 0);
      toast.success(`Recorded ${recorded.toLocaleString("en-NG")} vehicle(s) as called`);
      setConfirming(false);
      print();
      qc.invalidateQueries({ queryKey: ["report", "fpc-vehicles"] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not record the vehicles as called; nothing was printed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => (recording && total > 0 ? setConfirming(true) : print())}>
        <Printer className="size-4" />
        {recording ? "Print & record" : "Print"}
      </Button>
      <ModalFame isOpen={confirming} onClose={() => setConfirming(false)} title="Record as called">
        <div className="grid gap-4">
          <p className="text-sm text-slate-700">
            Printing records <span className="font-semibold">{total.toLocaleString("en-NG")}</span> vehicle(s) as called. They then appear under
            &quot;Called but not visited&quot; until they visit.
          </p>
          <ul className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <li>Letter sent: {contacts.letter.length.toLocaleString("en-NG")}</li>
            <li>On the call list (phone): {contacts.phone.length.toLocaleString("en-NG")}</li>
          </ul>
          <AlertBanner tone="amber" icon={<ShieldAlert />} title="This cannot be undone from here">
            Each vehicle gets a contact with outcome &quot;sent&quot;. Its status does not change, because the customer has not been reached yet.
          </AlertBanner>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => { setConfirming(false); print(); }}>Print without recording</Button>
            <Button disabled={saving} onClick={() => void recordAndPrint()}>
              {saving && <Loader2 className="size-4 animate-spin" />} Record & print
            </Button>
          </div>
        </div>
      </ModalFame>
    </>
  );
}
