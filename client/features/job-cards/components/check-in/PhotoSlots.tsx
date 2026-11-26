"use client";
import { useRef, useState } from "react";
import { Camera, ImageOff, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { preparePhoto, usePhotoObjectUrl, useRemovePhoto, useUploadPhoto } from "../../hooks/use-job-check-in";
import { PHOTO_SLOT_LABELS } from "../../lib/check-in.logic";
import type { CheckInPhotoSlot, JobPhoto } from "../../types/job-check-in.types";

/** A stored photo, loaded through the API client because photos need the sign-in header. */
export function PhotoThumb({ jobCardId, photoId, alt, className }: { jobCardId: string; photoId: string; alt: string; className?: string }) {
  const photo = usePhotoObjectUrl(jobCardId, photoId);
  if (photo.isError)
    return (
      <span className={cn("flex flex-col items-center justify-center gap-1 bg-muted text-xs text-muted-foreground", className)}>
        <ImageOff className="size-4" aria-hidden="true" />
        Photo could not load
      </span>
    );
  if (!photo.url) return <span className={cn("block animate-pulse bg-muted", className)} aria-label={`Loading ${alt}`} role="img" />;
  // eslint-disable-next-line @next/next/no-img-element -- an object URL from the API, not a static asset
  return <img src={photo.url} alt={alt} className={cn("object-cover", className)} />;
}

/** The five walk-around photo slots: Front, Rear, Left, Right and Odometer. One photo each. */
export function PhotoSlots({
  jobCardId,
  slots,
  photos,
  editable,
}: {
  jobCardId: string;
  slots: CheckInPhotoSlot[];
  photos: JobPhoto[];
  editable: boolean;
}) {
  const upload = useUploadPhoto(jobCardId);
  const remove = useRemovePhoto(jobCardId);
  const [busySlot, setBusySlot] = useState<CheckInPhotoSlot | null>(null);
  const [confirming, setConfirming] = useState<CheckInPhotoSlot | null>(null);
  const [problem, setProblem] = useState<{ slot: CheckInPhotoSlot; message: string } | null>(null);
  const inputs = useRef<Partial<Record<CheckInPhotoSlot, HTMLInputElement | null>>>({});

  async function choose(slot: CheckInPhotoSlot, file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setBusySlot(slot);
    try {
      const image = await preparePhoto(file);
      await upload.mutateAsync({ requestId: crypto.randomUUID(), category: "CHECK_IN", slot, image });
      toast.success(`${PHOTO_SLOT_LABELS[slot]} photo saved`);
    } catch (error) {
      setProblem({ slot, message: error instanceof Error && !("response" in error) ? error.message : apiErrorMessage(error, "The photo was not saved. Try again.") });
    } finally {
      setBusySlot(null);
      const input = inputs.current[slot];
      if (input) input.value = "";
    }
  }

  async function removePhoto(slot: CheckInPhotoSlot, photoId: string) {
    setBusySlot(slot);
    try {
      await remove.mutateAsync(photoId);
      setConfirming(null);
      toast.success(`${PHOTO_SLOT_LABELS[slot]} photo removed`);
    } catch (error) {
      toast.error(apiErrorMessage(error, `The ${PHOTO_SLOT_LABELS[slot].toLowerCase()} photo was not removed. Try again.`));
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {slots.map((slot) => {
        const photo = photos.find((item) => item.category === "CHECK_IN" && item.slot === slot);
        const label = PHOTO_SLOT_LABELS[slot];
        const busy = busySlot === slot;
        return (
          <div key={slot} className="min-w-0 space-y-1.5">
            <input
              ref={(node) => {
                inputs.current[slot] = node;
              }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void choose(slot, event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={!editable || busy}
              onClick={() => inputs.current[slot]?.click()}
              aria-label={photo ? `Replace the ${label.toLowerCase()} photo` : `Add the ${label.toLowerCase()} photo`}
              title={photo ? `Replace the ${label.toLowerCase()} photo` : `Add the ${label.toLowerCase()} photo`}
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-muted/40"
            >
              {photo ? (
                <PhotoThumb jobCardId={jobCardId} photoId={photo.id} alt={`${label} photo`} className="absolute inset-0 size-full" />
              ) : (
                <Camera className="size-6" aria-hidden="true" />
              )}
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center bg-card/80">
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Saving the {label.toLowerCase()} photo</span>
                </span>
              )}
            </button>
            <div className="flex items-center justify-between gap-1">
              <span className="text-sm font-medium">{label}</span>
              {photo && editable && confirming !== slot && (
                <Button type="button" variant="ghost" size="icon" className="size-8" disabled={busy} aria-label={`Remove the ${label.toLowerCase()} photo`} title={`Remove the ${label.toLowerCase()} photo`} onClick={() => setConfirming(slot)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              )}
            </div>
            {photo && confirming === slot && (
              <div role="alertdialog" aria-label={`Remove the ${label.toLowerCase()} photo?`} className="space-y-2 rounded-lg border border-border p-2 text-xs">
                <p>Remove the {label.toLowerCase()} photo?</p>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void removePhoto(slot, photo.id)}>
                    Remove photo
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </div>
              </div>
            )}
            {problem?.slot === slot && (
              <div role="alert" className="space-y-1 text-xs text-destructive">
                <p>{problem.message}</p>
                <button type="button" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" onClick={() => inputs.current[slot]?.click()}>
                  <RefreshCw className="size-3" aria-hidden="true" />
                  Try again
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
