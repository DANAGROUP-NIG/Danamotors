"use client";
import { useId, useRef, useState } from "react";
import { Camera, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { preparePhoto } from "../../hooks/use-job-check-in";
import { useAddOutsideRecord, useRemoveOutsideRecord } from "../../hooks/use-job-warranty";
import {
  lagosToday,
  outsideRecordProblems,
  recordLine,
  type OutsideRecordForm,
  type OutsideRecordProblems,
} from "../../lib/warranty-check.logic";
import type { OutsideServiceRecord } from "../../types/job-warranty.types";

const EMPTY: OutsideRecordForm = { serviceDate: "", mileage: "", dealerName: "", note: "", image: null };
const SERVER_FIELDS: (keyof OutsideRecordForm)[] = ["serviceDate", "mileage", "dealerName", "note", "image"];

/**
 * A service done at another authorised dealer, from the customer's stamped service book. The
 * dialog keeps everything typed until Save record succeeds or the officer cancels.
 */
export function OutsideServiceDialog({
  jobCardId,
  saleDate,
  open,
  onClose,
}: {
  jobCardId: string;
  saleDate: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const add = useAddOutsideRecord(jobCardId);
  const [form, setForm] = useState<OutsideRecordForm>(EMPTY);
  const [problems, setProblems] = useState<OutsideRecordProblems>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  // One request ID per record: a retry after a lost response stores it once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const photoLabelId = useId();
  const today = lagosToday();
  const sale = saleDate ? saleDate.slice(0, 10) : null;
  const pending = add.isPending;

  const set = <K extends keyof OutsideRecordForm>(key: K, value: OutsideRecordForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setProblems((current) => ({ ...current, [key]: undefined }));
  };

  const close = () => {
    if (pending) return;
    setForm(EMPTY);
    setProblems({});
    setRequestId(crypto.randomUUID());
    onClose();
  };

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      set("image", await preparePhoto(file));
    } catch (error) {
      setProblems((current) => ({ ...current, image: error instanceof Error ? error.message : "The photo could not be read. Take it again." }));
    } finally {
      setPhotoBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const submit = () => {
    if (pending) return;
    const found = outsideRecordProblems(form, today, sale);
    setProblems(found);
    if (Object.keys(found).length) return;
    add.mutate(
      {
        requestId,
        serviceDate: form.serviceDate,
        mileage: Number(form.mileage.replace(/,/g, "")),
        dealerName: form.dealerName.trim(),
        note: form.note.trim() || undefined,
        image: form.image!,
      },
      {
        onSuccess: () => {
          toast.success(`Outside service record added: ${recordLine({ serviceDate: form.serviceDate, mileage: Number(form.mileage.replace(/,/g, "")), dealerName: form.dealerName.trim() })}`);
          setForm(EMPTY);
          setProblems({});
          setRequestId(crypto.randomUUID());
          onClose();
        },
        onError: (error) => {
          const field = (error as { response?: { data?: { details?: { field?: string }; errors?: { field?: string }[] } } })?.response?.data;
          const name = (field?.details?.field ?? field?.errors?.[0]?.field ?? "").replace(/^body\./, "") as keyof OutsideRecordForm;
          const message = apiErrorMessage(error, "The record was not saved. Check your connection and try again.");
          if (SERVER_FIELDS.includes(name)) setProblems((current) => ({ ...current, [name]: message }));
          else toast.error(message);
        },
      },
    );
  };

  return (
    <ModalFame
      isOpen={open}
      onClose={close}
      preventAccidentalClose
      title="Add outside service record"
      description="A service done at another authorised Kia dealer, from the stamped service book. It counts in the service history."
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service date" required error={problems.serviceDate}>
            <input
              type="date"
              className={inputCls}
              value={form.serviceDate}
              min={sale ?? undefined}
              max={today}
              disabled={pending}
              aria-invalid={!!problems.serviceDate}
              onChange={(event) => set("serviceDate", event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Km reading" required error={problems.mileage}>
            <input
              inputMode="numeric"
              className={`${inputCls} tabular-nums`}
              value={form.mileage}
              disabled={pending}
              aria-invalid={!!problems.mileage}
              onChange={(event) => set("mileage", event.target.value.replace(/[^\d,]/g, ""))}
            />
          </Field>
        </div>
        <Field label="Dealer" required error={problems.dealerName}>
          <input
            className={inputCls}
            value={form.dealerName}
            maxLength={120}
            disabled={pending}
            aria-invalid={!!problems.dealerName}
            onChange={(event) => set("dealerName", event.target.value)}
          />
          <span className="text-xs text-muted-foreground">The authorised Kia dealer named on the stamp, for example Kia Ikeja.</span>
        </Field>
        <Field label="Note" error={problems.note}>
          <textarea
            className={`${inputCls} h-20 py-2`}
            value={form.note}
            maxLength={500}
            disabled={pending}
            onChange={(event) => set("note", event.target.value)}
          />
        </Field>

        <div className="grid gap-1.5">
          <span id={photoLabelId} className="text-sm font-semibold">
            Photo of the stamped service book page<span className="text-red-500" aria-hidden="true"> *</span>
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
          />
          {form.image ? (
            <div className="flex flex-wrap items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URL the officer just took */}
              <img src={form.image} alt="Stamped service book page" className="h-32 w-auto max-w-full rounded-lg border border-border object-contain" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={pending || photoBusy} onClick={() => fileInput.current?.click()}>
                  <RefreshCw aria-hidden="true" />
                  Replace photo
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={pending || photoBusy} onClick={() => set("image", null)}>
                  <Trash2 aria-hidden="true" />
                  Remove photo
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button type="button" variant="outline" aria-describedby={photoLabelId} disabled={pending || photoBusy} onClick={() => fileInput.current?.click()}>
                {photoBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
                {photoBusy ? "Reading photo" : "Take or choose photo"}
              </Button>
            </div>
          )}
          {problems.image && (
            <span role="alert" className="text-sm text-red-500">
              {problems.image}
            </span>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || photoBusy}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Saving record" : "Save record"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}

/** Removing an outside record needs a reason; it stays on file (soft delete). */
export function RemoveRecordDialog({ jobCardId, record, onClose }: { jobCardId: string; record: OutsideServiceRecord | null; onClose: () => void }) {
  const remove = useRemoveOutsideRecord(jobCardId);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const pending = remove.isPending;
  const close = () => {
    if (pending) return;
    setReason("");
    setProblem(null);
    onClose();
  };
  const submit = () => {
    if (!record || pending) return;
    if (reason.trim().length < 3) {
      setProblem("Give the reason for removing this record");
      return;
    }
    remove.mutate(
      { recordId: record.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Outside service record removed: ${recordLine(record)}`);
          setReason("");
          onClose();
        },
        onError: (error) => toast.error(apiErrorMessage(error, "The record was not removed. Check your connection and try again.")),
      },
    );
  };
  return (
    <ModalFame
      isOpen={!!record}
      onClose={close}
      preventAccidentalClose
      title="Remove outside service record"
      description={record ? `${recordLine(record)}. It no longer counts in the service history, and stays on file with your reason.` : undefined}
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Reason for removing" required error={problem ?? undefined}>
          <textarea
            className={`${inputCls} h-24 py-2`}
            value={reason}
            maxLength={500}
            disabled={pending}
            aria-invalid={!!problem}
            autoFocus
            onChange={(event) => {
              setReason(event.target.value);
              setProblem(null);
            }}
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            Keep record
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {pending ? "Removing" : "Remove record"}
          </Button>
        </div>
      </form>
    </ModalFame>
  );
}
