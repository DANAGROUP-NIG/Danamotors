"use client";
import { useDeferredValue, useId, useState } from "react";
import { Loader2, Package, RefreshCw, Search, Wrench } from "lucide-react";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/forms/FormField";
import { useLabourOptions, usePartOptions } from "../../hooks/use-job-diagnosis";
import type { FindingItem } from "../../types/job-diagnosis.types";

/**
 * Search for the work (the vehicle model's labour operations) or the part needed. No prices are
 * fetched or shown. Choosing a result adds it and closes; the dialog closes otherwise only on Close.
 */
export function ItemPicker({
  jobCardId,
  kind,
  open,
  onPick,
  onClose,
}: {
  jobCardId: string;
  kind: "LABOUR" | "PART";
  open: boolean;
  onPick: (item: FindingItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim());
  const labour = useLabourOptions(jobCardId, q, open && kind === "LABOUR");
  const parts = usePartOptions(jobCardId, q, open && kind === "PART");
  const active = kind === "LABOUR" ? labour : parts;
  const inputId = useId();
  const listId = useId();
  const title = kind === "LABOUR" ? "Add work needed" : "Add a part needed";
  const options =
    kind === "LABOUR"
      ? (labour.data?.options ?? []).map((row) => ({ id: row.id, title: row.description, detail: row.code, item: { kind: "LABOUR" as const, referenceId: row.id, description: row.description, quantity: 1 } }))
      : (parts.data?.options ?? []).map((row) => ({
          id: row.id,
          title: row.name,
          detail: `${row.partNumber}${row.kind === "OIL" ? ", oil" : ""}`,
          item: { kind: row.kind, referenceId: row.id, description: row.name, quantity: 1 },
        }));
  const close = () => {
    setQuery("");
    onClose();
  };
  return (
    <ModalFame
      isOpen={open}
      onClose={close}
      preventAccidentalClose
      title={title}
      description={
        kind === "LABOUR"
          ? labour.data?.scope === "MODEL" && labour.data.model
            ? `Work set up for the ${labour.data.model}.`
            : "Search all work operations."
          : "Search by part name or number."
      }
    >
      <div className="grid gap-3">
        <label htmlFor={inputId} className="text-sm font-semibold">
          {kind === "LABOUR" ? "Search work" : "Search parts"}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={inputId}
            type="search"
            autoFocus
            className={`${inputCls} h-11 pl-9`}
            value={query}
            maxLength={80}
            placeholder={kind === "LABOUR" ? "For example brake pads" : "For example brake pads or 58101"}
            aria-controls={listId}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div id={listId} aria-live="polite" className="min-h-40">
          {active.isLoading && (
            <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching
            </p>
          )}
          {active.isError && (
            <div role="alert" className="grid gap-2 py-4 text-sm">
              <p>The list could not be loaded. Check your connection and try again.</p>
              <div>
                <Button type="button" variant="outline" onClick={() => void active.refetch()}>
                  <RefreshCw aria-hidden="true" />
                  Try again
                </Button>
              </div>
            </div>
          )}
          {active.data && !options.length && (
            <p className="py-4 text-sm text-muted-foreground">
              {q ? `Nothing matches "${q}". Try fewer letters or another word.` : "Nothing is set up yet. Ask the service manager to add it in Settings."}
            </p>
          )}
          {!!options.length && (
            <ul className="grid gap-1">
              {options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onPick(option.item);
                      close();
                    }}
                  >
                    {kind === "LABOUR" ? (
                      <Wrench className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium">{option.title}</span>
                      <span className="block text-xs text-muted-foreground">{option.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </ModalFame>
  );
}
