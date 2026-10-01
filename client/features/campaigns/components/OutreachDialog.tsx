"use client";

import { useState } from "react";
import { Calendar, ChevronUp, Copy, Loader2, Mail, MessageSquare, Phone, Smartphone, Store } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { DateTimeInput } from "@/components/forms/DateTimeInput";
import { useBranchStore } from "@/store/branch.store";
import { copyToClipboard } from "@/lib/table-actions";
import { cn } from "@/lib/utils";
import { Pill } from "@/features/warranty/components/ui";
import { CAMPAIGN_TYPE_LABELS, CAMPAIGN_VEHICLE_LABELS, CAMPAIGN_VEHICLE_TONES, fmtDate, personName } from "@/features/warranty/lib/warranty-format";
import { useAddContact, useCampaignVehicle, useScheduleCampaignVehicle } from "../hooks/use-campaigns";
import type { ContactChannel, ContactOutcome } from "../types/campaign.types";

const CHANNELS: { value: ContactChannel; label: string; icon: React.ReactNode }[] = [
  { value: "PHONE", label: "Phone", icon: <Phone /> },
  { value: "SMS", label: "SMS", icon: <MessageSquare /> },
  { value: "WHATSAPP", label: "WhatsApp", icon: <Smartphone /> },
  { value: "EMAIL", label: "Email", icon: <Mail /> },
  { value: "VISIT", label: "Visit", icon: <Store /> },
];

export const OUTCOME_LABELS: Record<ContactOutcome, string> = {
  REACHED: "Reached — customer agreed to visit",
  CALL_BACK: "Call back requested",
  NO_ANSWER: "No answer",
  WRONG_NUMBER: "Wrong number",
  DECLINED: "Reached — customer declined",
};

export const OUTCOME_SHORT: Record<ContactOutcome, string> = {
  REACHED: "Reached customer",
  CALL_BACK: "Call back requested",
  NO_ANSWER: "No answer",
  WRONG_NUMBER: "Wrong number",
  DECLINED: "Declined",
};

/** Screen 12 — log a contact attempt and book the campaign appointment. */
export function OutreachDialog({ campaignId, vehicleId, initialSection = "contact", onClose }: { campaignId: string; vehicleId: string; initialSection?: "contact" | "schedule"; onClose: () => void }) {
  const { data: row, isLoading } = useCampaignVehicle(campaignId, vehicleId);
  const addContact = useAddContact(campaignId, vehicleId);
  const schedule = useScheduleCampaignVehicle(campaignId, vehicleId);
  const branches = useBranchStore((s) => s.branches);

  const [channel, setChannel] = useState<ContactChannel>("PHONE");
  const [outcome, setOutcome] = useState<ContactOutcome>("REACHED");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [showSchedule, setShowSchedule] = useState(initialSection === "schedule");
  const [scheduledAt, setScheduledAt] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceNote, setServiceNote] = useState<string | null>(null);

  if (isLoading || !row) {
    return (
      <ModalFame isOpen onClose={onClose} title="Campaign outreach">
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      </ModalFame>
    );
  }

  const customer = row.vehicle?.customer;
  const effectiveBranch = branchId || customer?.branch.id || "";
  const note = serviceNote ?? `${CAMPAIGN_TYPE_LABELS[row.campaign.type]} ${row.campaign.code} — ${row.campaign.title}`;
  const canSchedule = Boolean(row.vehicle) && Boolean(scheduledAt) && Boolean(effectiveBranch) && row.status !== "COMPLETED";
  const pending = addContact.isPending || schedule.isPending;

  async function saveContact(thenSchedule: boolean) {
    await addContact.mutateAsync({ channel, outcome, notes: notes.trim() || null, nextFollowUpAt: followUp || null });
    setNotes("");
    if (thenSchedule && canSchedule) {
      await schedule.mutateAsync({ scheduledAt: new Date(scheduledAt).toISOString(), branchId: effectiveBranch, notes: note });
      onClose();
    }
  }

  return (
    <ModalFame isOpen onClose={onClose} title={`${CAMPAIGN_TYPE_LABELS[row.campaign.type]} outreach — ${row.vin}`}>
      <div className="grid gap-5">
        <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          {customer ? (
            <div className="text-sm">
              <p className="text-base font-semibold text-slate-900">
                {customer.firstName} {customer.lastName}
              </p>
              {customer.phoneNumber && (
                <p className="flex items-center gap-2">
                  <a href={`tel:${customer.phoneNumber}`} className="hover:underline">
                    {customer.phoneNumber}
                  </a>
                  <button type="button" aria-label="Copy phone" onClick={() => copyToClipboard(customer.phoneNumber!, "Phone copied")}>
                    <Copy className="size-3.5 text-slate-400" />
                  </button>
                </p>
              )}
              <p className="text-slate-500">
                {[row.vehicle?.make, row.vehicle?.model].filter(Boolean).join(" ")}
                {row.vehicle?.registrationNumber && ` · ${row.vehicle.registrationNumber}`} · {customer.branch.name}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">This VIN is not in the system yet. Register the vehicle and customer to contact them and book work.</p>
          )}
          <Pill status={CAMPAIGN_VEHICLE_LABELS[row.status]} tone={CAMPAIGN_VEHICLE_TONES[row.status]} />
        </div>

        {customer && row.status !== "COMPLETED" && (
          <section className="grid gap-3 rounded-xl border border-slate-200 p-4">
            <h3 className="font-semibold">Log contact attempt</h3>
            <div className="grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
              <span className="text-sm text-slate-600">Channel</span>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm [&_svg]:size-4",
                      channel === c.value ? "border-primary bg-primary text-white" : "border-slate-200 bg-white hover:bg-slate-50",
                    )}
                  >
                    {c.icon}
                    {c.label}
                  </button>
                ))}
              </div>
              <span className="text-sm text-slate-600">Outcome</span>
              <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value as ContactOutcome)}>
                {(Object.keys(OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
                  <option key={o} value={o}>
                    {OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-600">Notes</span>
              <textarea className={cn(inputCls, "h-20 py-2")} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <span className="text-sm text-slate-600">Next follow-up</span>
              <div className="max-w-52">
                <DateInput value={followUp} onChange={setFollowUp} />
              </div>
            </div>
          </section>
        )}

        {customer && row.status !== "COMPLETED" && (
          <section className="rounded-xl border border-slate-200 p-4">
            <button type="button" className="flex w-full items-center justify-between font-semibold" onClick={() => setShowSchedule((v) => !v)}>
              Schedule appointment
              <ChevronUp className={cn("size-4 transition-transform", !showSchedule && "rotate-180")} />
            </button>
            {row.appointment && (
              <p className="mt-2 text-sm text-slate-500">
                Current appointment: {fmtDate(row.appointment.scheduledAt)} ({row.appointment.status})
              </p>
            )}
            {showSchedule && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-center">
                <span className="text-sm text-slate-600">Date & time</span>
                <DateTimeInput value={scheduledAt} onChange={setScheduledAt} />
                <span className="text-sm text-slate-600">Branch</span>
                <select className={inputCls} value={effectiveBranch} onChange={(e) => setBranchId(e.target.value)}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-slate-600">Service note</span>
                <input className={inputCls} value={note} onChange={(e) => setServiceNote(e.target.value)} />
              </div>
            )}
          </section>
        )}

        <section>
          <h3 className="mb-2 font-semibold">Contact history</h3>
          {row.contactLogs.length === 0 ? (
            <p className="text-sm text-slate-400">No contact attempts yet.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-5">
              {row.contactLogs.map((log) => (
                <li key={log.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-slate-400" />
                  <p>
                    <span className="font-medium">{fmtDate(log.createdAt)}</span> · {OUTCOME_SHORT[log.outcome]} · {log.channel.toLowerCase()} · {personName(log.actor)}
                  </p>
                  {log.notes && <p className="text-slate-500">{log.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {customer && row.status !== "COMPLETED" && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => saveContact(false).then(() => !showSchedule && onClose())}>
                Save contact
              </Button>
              {showSchedule && (
                <Button disabled={pending || !canSchedule} onClick={() => saveContact(true)} className="gap-1.5">
                  <Calendar className="size-4" /> Save & schedule
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </ModalFame>
  );
}
