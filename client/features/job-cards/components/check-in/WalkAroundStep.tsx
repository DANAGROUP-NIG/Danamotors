"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Camera, CheckCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { preparePhoto, useAddDamageMark, useRemoveDamageMark, useUploadPhoto } from "../../hooks/use-job-check-in";
import {
  CHECKLIST_STATE_VIEW,
  checklistCounts,
  DAMAGE_TYPES,
  DAMAGE_VIEW,
  damageArea,
  damageLine,
  FUEL_OPTIONS,
  markRestPresent,
  nextChecklistState,
} from "../../lib/check-in.logic";
import type { Checklist, ChecklistItem, ChecklistState, DamageType, JobCheckIn, WalkAroundDraft } from "../../types/job-check-in.types";
import { StageCard } from "../workspace/StageCard";
import { CarDiagram } from "./CarDiagram";
import { PhotoSlots, PhotoThumb } from "./PhotoSlots";

const KEY_STATES: Record<string, ChecklistState> = { p: "PRESENT", m: "MISSING", n: "NOT_WORKING" };

/** Walk-around: tablet first, taps rather than typing. Changes save themselves (see useWalkAroundAutosave). */
export function WalkAroundStep({
  checkIn,
  draft,
  editable,
  onChange,
}: {
  checkIn: JobCheckIn;
  draft: WalkAroundDraft;
  editable: boolean;
  onChange: (change: Partial<WalkAroundDraft>) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="min-w-0 space-y-4">
        <FuelSelector value={draft.fuelLevel} editable={editable} onChange={(fuelLevel) => onChange({ fuelLevel })} />
        <ChecklistGrid
          items={checkIn.checklistItems}
          checklist={draft.checklist}
          note={draft.checklistNote}
          editable={editable}
          onChange={(checklist) => onChange({ checklist })}
          onNoteChange={(checklistNote) => onChange({ checklistNote })}
        />
      </div>
      <div className="min-w-0 space-y-4">
        <DamageCard checkIn={checkIn} editable={editable} />
        <StageCard title="Service book">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                role="switch"
                className="size-5 accent-primary"
                checked={draft.serviceBookSeen}
                disabled={!editable}
                onChange={(event) => onChange({ serviceBookSeen: event.target.checked, serviceBookStamps: event.target.checked ? draft.serviceBookStamps : null })}
              />
              Service book seen
            </label>
            {draft.serviceBookSeen && (
              <label className="flex items-center gap-3 text-sm font-medium">
                Stamps for this warranty year
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={12}
                  className="h-11 w-20 rounded-lg border border-border bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  value={draft.serviceBookStamps ?? ""}
                  disabled={!editable}
                  onChange={(event) => {
                    const value = event.target.value === "" ? null : Math.max(0, Math.min(12, Math.trunc(Number(event.target.value))));
                    onChange({ serviceBookStamps: Number.isFinite(value) ? value : null });
                  }}
                />
              </label>
            )}
          </div>
        </StageCard>
        <StageCard title="Personal belongings">
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={draft.noValuables}
              disabled={!editable}
              onChange={(event) => onChange({ noValuables: event.target.checked })}
            />
            No valuables left in the vehicle
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Items left in the vehicle (optional)
            <input
              className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              maxLength={500}
              value={draft.belongingsNote ?? ""}
              disabled={!editable}
              placeholder="For example: umbrella in boot"
              onChange={(event) => onChange({ belongingsNote: event.target.value })}
            />
          </label>
        </StageCard>
      </div>
      <div className="min-w-0 lg:col-span-2">
        <StageCard title="Photos" description="One photo for each side and the odometer. Tap a box to take or choose a photo.">
          <PhotoSlots jobCardId={checkIn.jobCardId} slots={checkIn.photoSlots} photos={checkIn.photos} editable={editable} />
        </StageCard>
      </div>
    </div>
  );
}

function FuelSelector({ value, editable, onChange }: { value: WalkAroundDraft["fuelLevel"]; editable: boolean; onChange: (value: WalkAroundDraft["fuelLevel"]) => void }) {
  const name = useId();
  return (
    <StageCard title="Fuel level">
      <fieldset disabled={!editable}>
        <legend className="sr-only">Choose the fuel level</legend>
        <div className="grid grid-cols-5 overflow-hidden rounded-lg border border-border">
          {FUEL_OPTIONS.map((option, index) => {
            const checked = value === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative flex min-h-14 cursor-pointer items-center justify-center text-base font-semibold transition-colors focus-within:z-10 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring",
                  index > 0 && "border-l border-border",
                  checked ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                  !editable && "cursor-default",
                )}
              >
                <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" aria-label={option.label} />
                <span aria-hidden="true">{option.short}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </StageCard>
  );
}

function ChecklistGrid({
  items,
  checklist,
  note,
  editable,
  onChange,
  onNoteChange,
}: {
  items: ChecklistItem[];
  checklist: Checklist;
  note: string | null;
  editable: boolean;
  onChange: (checklist: Checklist) => void;
  onNoteChange: (note: string) => void;
}) {
  const counts = checklistCounts(checklist, items);
  const helpId = useId();
  const set = (code: string, state: ChecklistState) => onChange({ ...checklist, [code]: state });
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, code: string) => {
    const state = KEY_STATES[event.key.toLowerCase()];
    if (!state || !editable) return;
    event.preventDefault();
    set(code, state);
  };
  return (
    <StageCard
      title="Checklist"
      description={
        counts.UNSET
          ? `${counts.UNSET} of ${items.length} items not checked yet.`
          : `All ${items.length} items checked: ${counts.MISSING} missing, ${counts.NOT_WORKING} not working.`
      }
      actions={
        editable && counts.UNSET > 0 ? (
          <Button type="button" variant="outline" onClick={() => onChange(markRestPresent(checklist, items))}>
            <CheckCheck aria-hidden="true" />
            Mark the rest present
          </Button>
        ) : undefined
      }
    >
      <p id={helpId} className="text-sm text-muted-foreground">
        Tap an item to change it: Present, Missing, Not working. With a keyboard, press P, M or N on an item.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const state = checklist[item.code];
          const view = CHECKLIST_STATE_VIEW[state ?? "UNSET"];
          return (
            <li key={item.code}>
              <button
                type="button"
                disabled={!editable}
                aria-describedby={helpId}
                aria-label={`${item.label}: ${view.label}`}
                onClick={() => set(item.code, nextChecklistState(state))}
                onKeyDown={(event) => onKey(event, item.code)}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-card"
              >
                <span className="min-w-0 break-words">{item.label}</span>
                <StatusBadge status={view.label} tone={view.tone} className="shrink-0 text-xs normal-case" />
              </button>
            </li>
          );
        })}
      </ul>
      <label className="grid gap-1.5 text-sm font-medium">
        Checklist notes (optional)
        <textarea
          rows={2}
          maxLength={1000}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          value={note ?? ""}
          disabled={!editable}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>
    </StageCard>
  );
}

/** Body and paint: the diagram, the marks in words, and adding or removing a mark. */
function DamageCard({ checkIn, editable }: { checkIn: JobCheckIn; editable: boolean }) {
  const add = useAddDamageMark(checkIn.jobCardId);
  const remove = useRemoveDamageMark(checkIn.jobCardId);
  const upload = useUploadPhoto(checkIn.jobCardId);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [type, setType] = useState<DamageType | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [confirming, setConfirming] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // A photo already stored for this mark, so a retry after a failed save does not store it twice.
  const storedPhoto = useRef<{ file: File; id: string } | null>(null);

  const start = (position: { x: number; y: number }) => {
    setDraft(position);
    setError(null);
    window.requestAnimationFrame(() => panel.current?.querySelector<HTMLInputElement>("input[type=radio]")?.focus());
  };
  const reset = () => {
    setDraft(null);
    setType(null);
    setNote("");
    setPhoto(null);
    setError(null);
    setRequestId(crypto.randomUUID());
    storedPhoto.current = null;
  };

  async function save() {
    if (!draft) return;
    if (!type) {
      setError("Choose Crack, Dent or Scratch.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let photoId: string | null = null;
      if (photo) {
        if (storedPhoto.current?.file !== photo)
          storedPhoto.current = {
            file: photo,
            id: (await upload.mutateAsync({ requestId: crypto.randomUUID(), category: "DAMAGE", image: await preparePhoto(photo) })).id,
          };
        photoId = storedPhoto.current.id;
      }
      await add.mutateAsync({ requestId, type, x: draft.x, y: draft.y, note: note.trim() || null, photoId });
      toast.success(`${damageLine({ type, ...draft })} marked`);
      reset();
    } catch (problem) {
      // Keep the mark, type, note and photo on screen so Save mark can be pressed again.
      setError(problem instanceof Error && !("response" in problem) ? problem.message : apiErrorMessage(problem, "The mark was not saved. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function removeMark(markId: string, label: string) {
    try {
      await remove.mutateAsync(markId);
      setConfirming(null);
      toast.success(`${label} removed`);
    } catch (problem) {
      toast.error(apiErrorMessage(problem, "The mark was not removed. Try again."));
    }
  }

  return (
    <StageCard title="Body and paint" description={editable ? "Tap the car to mark damage." : undefined}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        <CarDiagram marks={checkIn.damageMarks} draft={draft} editable={editable && !saving} onTap={start} onMoveDraft={setDraft} />
        <div className="min-w-0 space-y-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Damage types">
            {DAMAGE_TYPES.map((value) => (
              <li key={value} className="flex items-center gap-1.5">
                <span className="flex size-6 items-center justify-center rounded-full border border-border text-xs font-semibold" aria-hidden="true">
                  {DAMAGE_VIEW[value].letter}
                </span>
                {DAMAGE_VIEW[value].label}
              </li>
            ))}
          </ul>
          {editable && !draft && (
            <Button type="button" variant="outline" onClick={() => start({ x: 50, y: 50 })}>
              <Plus aria-hidden="true" />
              Add a mark with the keyboard
            </Button>
          )}
          {draft && (
            <div ref={panel} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-sm">
                Position: <span className="font-medium">{damageArea(draft.x, draft.y)}</span>
              </p>
              <fieldset className="space-y-1.5" disabled={saving}>
                <legend className="text-sm font-medium">
                  Type of damage <span className="text-destructive" aria-hidden="true">*</span>
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {DAMAGE_TYPES.map((value) => (
                    <label
                      key={value}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold focus-within:ring-2 focus-within:ring-ring",
                        type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <input type="radio" name="damage-type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                      {DAMAGE_VIEW[value].label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="grid gap-1.5 text-sm font-medium">
                Note (optional)
                <input
                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={300}
                  value={note}
                  disabled={saving}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" disabled={saving} onClick={() => photoInput.current?.click()}>
                  <Camera aria-hidden="true" />
                  {photo ? "Change photo" : "Add photo (optional)"}
                </Button>
                {photo && <span className="min-w-0 truncate text-muted-foreground" title={photo.name}>{photo.name}</span>}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={saving} onClick={() => void save()}>
                  {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {saving ? "Saving mark" : "Save mark"}
                </Button>
                <Button type="button" variant="outline" disabled={saving} onClick={reset}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {checkIn.damageMarks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No damage marked.</p>
          ) : (
            <ul className="space-y-2" aria-label="Damage marks">
              {checkIn.damageMarks.map((mark) => {
                const label = damageLine(mark);
                return (
                  <li key={mark.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
                    {mark.photoId && <PhotoThumb jobCardId={checkIn.jobCardId} photoId={mark.photoId} alt={`Photo: ${label}`} className="size-12 rounded" />}
                    <span className="min-w-0 flex-1 break-words">
                      {label}
                      {mark.note && <span className="block text-muted-foreground">{mark.note}</span>}
                    </span>
                    {editable &&
                      (confirming === mark.id ? (
                        <span role="alertdialog" aria-label={`Remove ${label}?`} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs">Remove this mark?</span>
                          <Button type="button" size="sm" variant="destructive" disabled={remove.isPending} onClick={() => void removeMark(mark.id, label)}>
                            Remove mark
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={remove.isPending} onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button type="button" variant="ghost" size="icon" className="size-9" aria-label={`Remove ${label}`} title={`Remove ${label}`} onClick={() => setConfirming(mark.id)}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </StageCard>
  );
}
