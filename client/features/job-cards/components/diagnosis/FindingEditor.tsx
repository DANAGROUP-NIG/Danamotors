"use client";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Camera, CircleCheck, Loader2, Mic, MicOff, Minus, Package, Plus, RefreshCw, TriangleAlert, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { cn } from "@/lib/utils";
import { preparePhoto } from "../../hooks/use-job-check-in";
import { useAddFindingPhoto, useRemoveFindingPhoto } from "../../hooks/use-job-diagnosis";
import { saveStateText, type SaveState } from "../../lib/check-in.logic";
import {
  FINDING_TEXT_MAX,
  MAX_ITEMS_PER_FINDING,
  MAX_PHOTOS_PER_FINDING,
  addItem,
  appendDictation,
  formatQuantity,
  parseQuantity,
  speechRecognitionAvailable,
  stepQuantity,
} from "../../lib/diagnosis.logic";
import type { FindingDraft, FindingItem } from "../../types/job-diagnosis.types";
import { PhotoThumb } from "../check-in/PhotoSlots";
import { ItemPicker } from "./ItemPicker";

/** The finding's autosave, as useFindingAutosave returns it. */
export interface FindingAutosave {
  findingId: string;
  saved: boolean;
  draft: FindingDraft;
  update: (change: Partial<FindingDraft>) => void;
  flush: () => Promise<boolean>;
  reload: () => Promise<void>;
  state: SaveState;
}

/**
 * One finding: what was found (typed or dictated), photos, work needed, parts needed and the
 * possible warranty switch. Large touch targets for a phone. No prices anywhere.
 */
export function FindingEditor({
  jobCardId,
  autosave,
  photos,
  editable,
  textLabel = "What did you find?",
}: {
  jobCardId: string;
  autosave: FindingAutosave;
  photos: { id: string }[];
  editable: boolean;
  textLabel?: string;
}) {
  const { draft, update } = autosave;
  const textId = useId();
  const helpId = useId();
  const [picker, setPicker] = useState<"LABOUR" | "PART" | null>(null);
  const work = draft.items.filter((item) => item.kind === "LABOUR");
  const parts = draft.items.filter((item) => item.kind !== "LABOUR");
  const full = draft.items.length >= MAX_ITEMS_PER_FINDING;

  const setItems = (items: FindingItem[]) => update({ items });
  const removeItem = (target: FindingItem) => setItems(draft.items.filter((item) => item !== target));
  const setQuantity = (target: FindingItem, quantity: number) => setItems(draft.items.map((item) => (item === target ? { ...item, quantity } : item)));

  return (
    <div className="grid gap-5">
      <div className="grid gap-1.5">
        <label htmlFor={textId} className="text-sm font-semibold">
          {textLabel}
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        </label>
        <div className="relative">
          <textarea
            id={textId}
            className={cn(inputCls, "min-h-28 py-2 pr-14 text-base sm:text-sm")}
            maxLength={FINDING_TEXT_MAX}
            readOnly={!editable}
            aria-describedby={helpId}
            value={draft.causeAndDefect}
            onChange={(event) => update({ causeAndDefect: event.target.value })}
          />
          {editable && <DictateButton onHeard={(words) => update({ causeAndDefect: appendDictation(draft.causeAndDefect, words) })} />}
        </div>
        <p id={helpId} className="text-xs text-muted-foreground">
          Required. The cause and nature of the defect, in plain words.
        </p>
      </div>

      <FindingPhotos jobCardId={jobCardId} autosave={autosave} photos={photos} editable={editable} />

      <div className="grid gap-2">
        <h4 className="text-sm font-semibold">Work needed</h4>
        {!work.length && <p className="text-sm text-muted-foreground">No work added.</p>}
        <ul className="flex flex-wrap gap-2">
          {work.map((item) => (
            <li key={`${item.kind}:${item.referenceId}`} className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 pl-3 text-sm text-blue-800">
              <Wrench className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words py-2">{item.description}</span>
              {editable ? (
                <button
                  type="button"
                  className="flex size-11 items-center justify-center rounded-lg hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove work: ${item.description}`}
                  title="Remove work"
                  onClick={() => removeItem(item)}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : (
                <span className="pr-3" />
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div>
            <Button type="button" variant="outline" className="min-h-11" disabled={full} onClick={() => setPicker("LABOUR")}>
              <Plus aria-hidden="true" />
              Add work
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <h4 className="text-sm font-semibold">Parts needed</h4>
        {!parts.length && <p className="text-sm text-muted-foreground">No parts added.</p>}
        <ul className="grid gap-2">
          {parts.map((item) => (
            <PartRow
              key={`${item.kind}:${item.referenceId}`}
              item={item}
              editable={editable}
              onQuantity={(quantity) => setQuantity(item, quantity)}
              onRemove={() => removeItem(item)}
            />
          ))}
        </ul>
        {editable && (
          <div>
            <Button type="button" variant="outline" className="min-h-11" disabled={full} onClick={() => setPicker("PART")}>
              <Plus aria-hidden="true" />
              Add part
            </Button>
          </div>
        )}
        {editable && full && <p className="text-xs text-muted-foreground">A finding can list up to {MAX_ITEMS_PER_FINDING} work and part lines.</p>}
      </div>

      <WarrantySwitch checked={draft.possibleWarranty} editable={editable} onChange={(possibleWarranty) => update({ possibleWarranty })} />

      {editable && <SaveIndicator state={autosave.state} onRetry={() => void autosave.flush()} onReload={() => void autosave.reload()} />}

      {picker && (
        <ItemPicker
          jobCardId={jobCardId}
          kind={picker}
          open
          onClose={() => setPicker(null)}
          onPick={(item) => setItems(addItem(draft.items, item))}
        />
      )}
    </div>
  );
}

function PartRow({ item, editable, onQuantity, onRemove }: { item: FindingItem; editable: boolean; onQuantity: (quantity: number) => void; onRemove: () => void }) {
  const [text, setText] = useState(formatQuantity(item.quantity));
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const shown = formatQuantity(item.quantity);
  const change = (quantity: number) => {
    setError(null);
    setText(formatQuantity(quantity));
    onQuantity(quantity);
  };
  return (
    <li className="grid gap-1 rounded-lg border border-border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 basis-40 break-words text-sm">
          {item.description}
          {item.kind === "OIL" && <span className="text-muted-foreground"> (oil)</span>}
        </span>
        {editable ? (
          <div className="ml-auto flex items-center gap-1">
            <label htmlFor={inputId} className="mr-1 text-sm text-muted-foreground">
              Qty
            </label>
            <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`Fewer: ${item.description}`} title="Fewer" onClick={() => change(stepQuantity(item.kind, item.quantity, -1))}>
              <Minus aria-hidden="true" />
            </Button>
            <input
              id={inputId}
              inputMode="decimal"
              className={cn(inputCls, "h-11 w-16 text-center tabular-nums")}
              value={text === shown || error ? text : shown}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              onChange={(event) => {
                setText(event.target.value);
                const parsed = parseQuantity(event.target.value);
                if (parsed.ok) {
                  setError(null);
                  onQuantity(parsed.quantity);
                } else setError(parsed.message);
              }}
              onBlur={() => {
                if (!error) setText(formatQuantity(item.quantity));
              }}
            />
            <Button type="button" variant="outline" size="icon" className="size-11" aria-label={`More: ${item.description}`} title="More" onClick={() => change(stepQuantity(item.kind, item.quantity, 1))}>
              <Plus aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Remove part: ${item.description}`} title="Remove part" onClick={onRemove}>
              <X aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <span className="text-sm tabular-nums text-muted-foreground">Qty {shown}</span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function WarrantySwitch({ checked, editable, onChange }: { checked: boolean; editable: boolean; onChange: (value: boolean) => void }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-semibold">
          Possible warranty
        </p>
        <p id={helpId} className="text-xs text-muted-foreground">
          Turn on if the manufacturer may cover this. The warranty officer decides.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={helpId}
        disabled={!editable}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-11 w-16 shrink-0 items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
          checked ? "border-purple-700 bg-purple-700" : "border-border bg-muted",
        )}
      >
        <span className={cn("ml-1 inline-block size-8 rounded-full bg-background shadow transition-transform", checked && "translate-x-5")} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function FindingPhotos({ jobCardId, autosave, photos, editable }: { jobCardId: string; autosave: FindingAutosave; photos: { id: string }[]; editable: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const add = useAddFindingPhoto(jobCardId);
  const remove = useRemoveFindingPhoto(jobCardId);
  const full = photos.length >= MAX_PHOTOS_PER_FINDING;
  const choose = async (file: File | undefined) => {
    if (!file) return;
    try {
      const image = await preparePhoto(file);
      // A new finding is saved first, so the photo has a finding to belong to.
      if (!autosave.saved) autosave.update({});
      if (!(await autosave.flush())) {
        toast.error("The finding was not saved, so the photo was not added. Press Retry, then add the photo again.");
        return;
      }
      await add.mutateAsync({ findingId: autosave.findingId, requestId: crypto.randomUUID(), image });
      toast.success("Photo added");
    } catch (error) {
      toast.error(error instanceof Error && !("response" in error) ? error.message : apiErrorMessage(error, "The photo was not added. Check your connection and try again."));
    }
  };
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-semibold">Photos ({photos.length})</h4>
      {!editable && !photos.length && <p className="text-sm text-muted-foreground">No photos.</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="relative overflow-hidden rounded-lg border border-border">
            <PhotoThumb jobCardId={jobCardId} photoId={photo.id} alt={`Finding photo ${index + 1}`} className="aspect-[4/3] w-full" />
            {editable && (
              <button
                type="button"
                className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full border border-border bg-background/90 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove photo ${index + 1}`}
                title="Remove photo"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { findingId: autosave.findingId, photoId: photo.id },
                    { onError: (error) => toast.error(apiErrorMessage(error, "The photo was not removed. Try again.")) },
                  )
                }
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {editable && !full && (
          <li>
            <button
              type="button"
              disabled={add.isPending}
              onClick={() => input.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {add.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
              {add.isPending ? "Adding" : "Add photo"}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </li>
        )}
      </ul>
      {editable && full && <p className="text-xs text-muted-foreground">A finding can have up to {MAX_PHOTOS_PER_FINDING} photos. Remove one to add another.</p>}
    </div>
  );
}

/** "Saved 10:42" under the finding, or what went wrong with a way to fix it. */
export function SaveIndicator({ state, onRetry, onReload }: { state: SaveState; onRetry: () => void; onReload: () => void }) {
  if (state.kind === "error" || state.kind === "conflict")
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {state.kind === "conflict" ? "Not saved. This finding was changed on another screen." : saveStateText(state)}
        <Button type="button" size="sm" variant="outline" onClick={state.kind === "conflict" ? onReload : onRetry}>
          <RefreshCw aria-hidden="true" />
          {state.kind === "conflict" ? "Load the latest" : "Retry"}
        </Button>
      </div>
    );
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {state.kind === "saving" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : state.kind === "saved" ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
      {state.kind === "idle" ? "Saves by itself as you work" : saveStateText(state)}
    </p>
  );
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

const noSubscribe = () => () => undefined;

/** The microphone button: the browser's own speech input, shown only where the browser has it. */
function DictateButton({ onHeard }: { onHeard: (words: string) => void }) {
  const supported = useSyncExternalStore(noSubscribe, () => speechRecognitionAvailable(window), () => false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  if (!supported) return null;
  const toggle = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const scope = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Engine = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Engine) return;
    const engine = new Engine();
    engine.lang = "en-NG";
    engine.interimResults = false;
    engine.continuous = false;
    engine.onresult = (event) => {
      const words = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      onHeard(words);
    };
    engine.onend = () => setListening(false);
    engine.onerror = () => {
      setListening(false);
      toast.error("Voice input stopped. Type the finding instead, or try again.");
    };
    recognition.current = engine;
    setListening(true);
    engine.start();
  };
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn("absolute right-1.5 top-1.5 size-11", listening && "border-red-300 bg-red-50 text-red-700")}
      aria-label={listening ? "Stop voice input" : "Speak the finding"}
      aria-pressed={listening}
      title={listening ? "Stop voice input" : "Speak the finding"}
      onClick={toggle}
    >
      {listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
    </Button>
  );
}
