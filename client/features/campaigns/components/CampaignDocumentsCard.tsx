"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { SectionCard } from "@/features/warranty/components/ui";
import { fmtDate, fmtFileSize, personName } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { useDeleteCampaignDocument, useDownloadCampaignDocument, useUploadCampaignDocument } from "../hooks/use-campaigns";
import { ACCEPTED_MANUAL_EXTENSIONS, manualFileError, titleFromFileName } from "../lib/manual-file";
import type { Campaign, CampaignDocument } from "../types/campaign.types";

/** Campaign manuals: every role can download them; the warranty team imports and removes them. */
export function CampaignDocumentsCard({ campaign, canEdit }: { campaign: Campaign; canEdit: boolean }) {
  const documents = campaign.documents ?? [];
  const download = useDownloadCampaignDocument();
  const remove = useDeleteCampaignDocument(campaign.id);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<CampaignDocument | null>(null);

  return (
    <SectionCard
      icon={<FileText />}
      title="Campaign Manuals"
      note="Repair procedures and bulletins from Kia."
      action={
        canEdit && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploading(true)}>
            <Upload className="size-4" aria-hidden="true" /> Import manual
          </Button>
        )
      }
    >
      {documents.length === 0 ? (
        <p className="text-sm text-slate-500">
          {canEdit
            ? "No manuals yet. Import the manufacturer's manual so advisers and technicians can download it."
            : "The warranty team has not added a manual for this campaign yet."}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {documents.map((doc) => {
            const busy = download.isPending && download.variables?.id === doc.id;
            return (
              <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800" title={doc.title}>
                      {doc.title}
                    </p>
                    <p className="truncate text-xs text-slate-500" title={doc.fileName}>
                      {doc.fileName} · {fmtFileSize(doc.sizeBytes)} · Added {fmtDate(doc.createdAt)}
                      {doc.uploadedBy && ` by ${personName(doc.uploadedBy)}`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => download.mutate({ campaignId: campaign.id, id: doc.id, fileName: doc.fileName })}
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
                    {busy ? "Downloading" : "Download"}
                  </Button>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:bg-red-50"
                      aria-label={`Remove manual ${doc.title}`}
                      title={`Remove manual ${doc.title}`}
                      onClick={() => setRemoving(doc)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {uploading && <UploadManualDialog campaignId={campaign.id} onClose={() => setUploading(false)} />}
      <ConfirmDeleteModal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove campaign manual"
        message={removing ? `Remove "${removing.title}" (${removing.fileName}) from campaign ${campaign.code}? Advisers and technicians will no longer be able to download it.` : ""}
        isPending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(null) })}
      />
    </SectionCard>
  );
}

function UploadManualDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const upload = useUploadCampaignDocument(campaignId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [attempted, setAttempted] = useState(false);

  const fileError = file ? manualFileError(file) : "Choose the manual file";
  const titleError = title.trim() ? undefined : "Enter a title, for example Service procedure";

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    setFile(chosen);
    if (!title.trim()) setTitle(titleFromFileName(chosen.name));
  }

  function save() {
    setAttempted(true);
    if (!file || fileError || titleError || upload.isPending) return;
    upload.mutate({ title: title.trim(), file }, { onSuccess: onClose });
  }

  return (
    <ModalFame isOpen onClose={onClose} title="Import campaign manual" preventAccidentalClose>
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <span className="text-sm font-semibold">
            Manual file<span className="text-red-500" aria-hidden="true"> *</span>
          </span>
          <input
            ref={fileInput}
            id="campaign-manual-file"
            type="file"
            accept={ACCEPTED_MANUAL_EXTENSIONS}
            className="sr-only"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          <label
            htmlFor="campaign-manual-file"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-4 text-sm focus-within:ring-2 focus-within:ring-ring hover:bg-slate-50",
              attempted && fileError ? "border-red-400" : "border-slate-300",
            )}
          >
            <Upload className="size-5 text-slate-500" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-800">{file ? file.name : "Choose a PDF, PNG or JPEG"}</span>
              <span className="block text-xs text-slate-500">{file ? fmtFileSize(file.size) : "Up to 10 MB. Large scans can be split into parts."}</span>
            </span>
          </label>
          {(attempted || file) && fileError && <span className="text-sm text-red-500">{fileError}</span>}
        </div>
        <Field label="Title" required error={attempted ? titleError : undefined}>
          <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <p className="text-xs text-slate-500">Everyone who can see the campaign can download this manual, including technicians and store staff.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={upload.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={upload.isPending || (attempted && Boolean(fileError || titleError))} className="gap-1.5">
            {upload.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {upload.isPending ? "Uploading manual" : "Upload manual"}
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
