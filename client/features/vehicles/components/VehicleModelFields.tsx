"use client";

import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Loader2 } from "lucide-react";
import { Field, inputCls } from "@/components/forms/FormField";
import {
  getCatalogModels, getCatalogOptions, matchesModel, normalizeCatalogName,
  type CatalogModel,
} from "../api/vehicle-catalog.api";

export type ModelSelection = {
  modelId?: string | null;
  customModel?: string | null;
  customMake?: string | null;
  generationId?: string | null;
  engineId?: string | null;
};
type Props = {
  value: ModelSelection;
  onChange: (value: ModelSelection) => void;
  selectedName?: string | null;
  error?: string;
};
const catalogCache = {
  staleTime: Infinity,
  gcTime: Infinity,
  retry: false,
  refetchOnWindowFocus: false,
} as const;

export function VehicleModelFields({ value, onChange, selectedName, error }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(-1);
  const models = useQuery({
    queryKey: ["vehicle-catalog", "models"],
    queryFn: getCatalogModels,
    ...catalogCache,
  });
  const options = useQuery({
    queryKey: ["vehicle-catalog", "options", value.modelId],
    queryFn: () => getCatalogOptions(value.modelId!),
    enabled: !!value.modelId,
    ...catalogCache,
  });
  const selected = models.data?.find(model => model.id === value.modelId);
  const filtered = (models.data ?? []).filter(model => matchesModel(model, search)).slice(0, 8);
  const exact = (models.data ?? []).some(model =>
    [model.searchName, ...model.aliases].includes(normalizeCatalogName(search)),
  );
  const customName = search.trim().replace(/\s+/g, " ");
  const canCreate = !models.isPending && !!customName && !exact && customName.length <= 80;
  const count = filtered.length + (canCreate ? 1 : 0);
  const label = value.modelId
    ? selected?.name || selectedName || "Selected catalog model"
    : value.customModel || "";
  const engines = options.data?.find(generation => generation.id === value.generationId)?.engines ?? [];

  function commit(model?: CatalogModel) {
    onChange({
      modelId: model?.id ?? null,
      customModel: model ? null : customName,
      customMake: model ? null : value.customMake ?? "",
      generationId: null,
      engineId: null,
    });
    setSearch("");
    setOpen(false);
    setActive(-1);
  }

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [open, active, id]);

  // Preserve input typed while the initial request was still pending if it fails.
  useEffect(() => {
    if (models.isError && !value.modelId && search && value.customModel !== search) {
      onChange({ ...value, customModel: search });
    }
  }, [models.isError, value, search, onChange]);

  return (
    <div className="space-y-4">
      <div className="relative space-y-1.5" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}>
        <label htmlFor={id} className="text-sm font-semibold">
          Model <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input
            id={id}
            role={models.isError ? undefined : "combobox"}
            aria-expanded={models.isError ? undefined : open}
            aria-controls={!models.isError && open ? `${id}-options` : undefined}
            aria-autocomplete={models.isError ? undefined : "list"}
            aria-activedescendant={!models.isError && open && active >= 0 ? `${id}-${active}` : undefined}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            autoComplete="off"
            maxLength={80}
            className={`${inputCls} pl-9 pr-9`}
            value={open ? search : label || search}
            placeholder="Search a model or enter your own"
            onFocus={() => { setSearch(label || search); setOpen(true); }}
            onChange={event => {
              const text = event.target.value;
              setSearch(text);
              setOpen(true);
              setActive(-1);
              onChange({
                modelId: null,
                customModel: models.isError ? text : "",
                customMake: value.customMake,
                generationId: null,
                engineId: null,
              });
            }}
            onKeyDown={event => {
              if (models.isError) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive(current => count === 0 ? -1 : Math.max(0, Math.min(count - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1))));
              } else if (event.key === "Enter" && open) {
                event.preventDefault();
                if (active >= 0 && active < count) commit(filtered[active]);
              } else if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
          {models.isFetching && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {open && !models.isError && (
          <ul id={`${id}-options`} role="listbox" aria-label="Vehicle models"
            className="absolute z-30 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
            {models.isPending && <li role="presentation" className="p-3 text-sm text-muted-foreground">Loading catalogue...</li>}
            {filtered.map((model, index) => (
              <li key={model.id} id={`${id}-${index}`} role="option"
                aria-selected={model.id === value.modelId}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md p-3 text-sm ${active === index ? "bg-accent" : "hover:bg-muted"}`}
                onMouseDown={event => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => commit(model)}>
                <span>
                  <span className="block font-medium">{model.name}</span>
                  <span className="text-xs text-muted-foreground">{model.make} / {model.yearStart} - {model.yearEnd ?? "present"}</span>
                </span>
                {model.id === value.modelId && <Check className="h-4 w-4" />}
              </li>
            ))}
            {canCreate && (
              <li id={`${id}-${filtered.length}`} role="option" aria-selected={false}
                className={`cursor-pointer rounded-md border-t p-3 text-sm font-medium text-primary ${active === filtered.length ? "bg-accent" : "hover:bg-muted"}`}
                onMouseDown={event => event.preventDefault()}
                onMouseMove={() => setActive(filtered.length)}
                onClick={() => commit()}>
                Add &quot;{customName}&quot;
              </li>
            )}
            {!models.isPending && !filtered.length && !canCreate && (
              <li role="presentation" className="p-3 text-sm text-muted-foreground">Type a model name to search or add it.</li>
            )}
          </ul>
        )}
        {models.isError && (
          <p role="status" className="text-xs text-muted-foreground">
            Catalogue unavailable. Type your model to save it as a custom entry.{" "}
            <button type="button" className="underline" onClick={() => models.refetch()}>Retry catalogue</button>
          </p>
        )}
        {error && <p role="alert" id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
      </div>
      {!value.modelId && (
        <Field label="Make (optional)">
          <input className={inputCls} maxLength={80} value={value.customMake ?? ""}
            placeholder="e.g. Kia" onChange={event => onChange({ ...value, customMake: event.target.value })} />
        </Field>
      )}
      {!!value.modelId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Generation (optional)">
            <select className={inputCls} value={value.generationId ?? ""}
              disabled={options.isPending || options.isError}
              onChange={event => onChange({ ...value, generationId: event.target.value || null, engineId: null })}>
              <option value="">{options.isPending ? "Loading generations..." : "Not specified"}</option>
              {options.data?.map(generation => (
                <option key={generation.id} value={generation.id}>
                  {generation.name} / {generation.yearStart} - {generation.yearEnd ?? "present"} ({generation.engines.length} engine options)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Engine (optional)">
            <select className={inputCls} value={value.engineId ?? ""}
              disabled={!value.generationId || options.isPending || options.isError}
              onChange={event => onChange({ ...value, engineId: event.target.value || null })}>
              <option value="">Not specified</option>
              {engines.map(engine => (
                <option key={engine.id} value={engine.id}>
                  {engine.label}{engine.transmission ? ` / ${engine.transmission}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {options.isError && (
            <p role="alert" className="text-xs text-destructive sm:col-span-2">
              Could not load optional generation and engine choices. You can save the model alone.{" "}
              <button type="button" className="underline" onClick={() => options.refetch()}>Retry</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
