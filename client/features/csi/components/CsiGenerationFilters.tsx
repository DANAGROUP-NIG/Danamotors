"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, inputCls } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import {
  useCsiGenerationOptions,
  type GenerationFilters,
} from "../hooks/use-csi-issuance";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";

const initial: GenerationFilters = {
  from: "",
  to: "",
  jobFrom: "",
  jobTo: "",
  serviceTypeId: "",
  modelId: "",
  variantId: "",
  registration: "",
  order: "JOB",
};
const filterInput = `${inputCls} disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground`;
type Group =
  | "dates"
  | "jobs"
  | "serviceTypeId"
  | "modelId"
  | "variantId"
  | "registration";
function AllToggle({
  label,
  all,
  onChange,
  disabled,
}: {
  label: string;
  all: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Checkbox
          aria-label={`All ${label.toLowerCase()}`}
          checked={all}
          disabled={disabled}
          onCheckedChange={onChange}
        />
        <span>All</span>
      </div>
    </div>
  );
}
export function CsiGenerationFilters({
  branchId,
  busy,
  onApply,
}: {
  branchId: string;
  busy: boolean;
  onApply: (filters: GenerationFilters) => void;
}) {
  const options = useCsiGenerationOptions(branchId, true);
  const [values, setValues] = useState(initial);
  const [active, setActive] = useState<Set<Group>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const change = (key: keyof GenerationFilters, value: string) =>
    setValues((old) => ({
      ...old,
      [key]: value,
      ...(key === "modelId" ? { variantId: "" } : {}),
    }));
  const toggle = (group: Group, all: boolean) => {
    setActive((old) => {
      const next = new Set(old);
      if (all) next.delete(group);
      else next.add(group);
      if (group === "modelId" && all) next.delete("variantId");
      return next;
    });
    setErrors({});
  };
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors: Record<string, string> = {};
    if (
      active.has("dates") &&
      (!values.from || !values.to || values.to < values.from)
    )
      errors.dates =
        "Select both job dates, with the end date on or after the start date.";
    if (
      active.has("jobs") &&
      (!values.jobFrom || !values.jobTo || values.jobTo < values.jobFrom)
    )
      errors.jobs =
        "Enter both job numbers, with the last number on or after the first.";
    for (const key of [
      "serviceTypeId",
      "modelId",
      "variantId",
      "registration",
    ] as const)
      if (active.has(key) && !values[key].trim())
        errors[key] = "Select or enter this filter, or select All.";
    setErrors(errors);
    if (Object.keys(errors).length) return;
    onApply({
      from: active.has("dates") ? values.from : "",
      to: active.has("dates") ? values.to : "",
      jobFrom: active.has("jobs") ? values.jobFrom.trim() : "",
      jobTo: active.has("jobs") ? values.jobTo.trim() : "",
      serviceTypeId: active.has("serviceTypeId") ? values.serviceTypeId : "",
      modelId: active.has("modelId") ? values.modelId : "",
      variantId:
        active.has("modelId") && active.has("variantId")
          ? values.variantId
          : "",
      registration: active.has("registration")
        ? values.registration.trim()
        : "",
      order: values.order,
    });
  };
  return (
    <form
      onSubmit={apply}
      className="space-y-4 rounded-xl border border-border p-4"
      aria-label="CSI generation filters"
    >
      <p className="text-sm text-muted-foreground">
        Job dates refer to opening dates in Africa/Lagos. Only delivered jobs
        are eligible. Narrow the filters if more than 1,000 jobs match.
      </p>
      {options.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading job types, models and variants.
        </p>
      )}
      {options.isError && (
        <div role="alert" className="space-y-2 text-sm">
          <p>
            {apiErrorMessage(
              options.error,
              "Filter options could not be loaded. Retry before selecting a job type or model.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void options.refetch()}
          >
            Retry filter options
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <AllToggle
            label="Job dates"
            all={!active.has("dates")}
            onChange={(value) => toggle("dates", value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="From">
              <DateInput
                className={filterInput}
                value={values.from}
                onChange={(value) => change("from", value)}
                disabled={!active.has("dates")}
                invalid={!!errors.dates}
              />
            </Field>
            <Field label="To">
              <DateInput
                className={filterInput}
                value={values.to}
                onChange={(value) => change("to", value)}
                min={values.from || undefined}
                disabled={!active.has("dates")}
                invalid={!!errors.dates}
              />
            </Field>
          </div>
          {errors.dates && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.dates}
            </p>
          )}
        </div>
        <div>
          <AllToggle
            label="Job numbers"
            all={!active.has("jobs")}
            onChange={(value) => toggle("jobs", value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="First">
              <input
                className={filterInput}
                value={values.jobFrom}
                maxLength={40}
                disabled={!active.has("jobs")}
                aria-invalid={!!errors.jobs}
                onChange={(event) => change("jobFrom", event.target.value)}
              />
            </Field>
            <Field label="Last">
              <input
                className={filterInput}
                value={values.jobTo}
                maxLength={40}
                disabled={!active.has("jobs")}
                aria-invalid={!!errors.jobs}
                onChange={(event) => change("jobTo", event.target.value)}
              />
            </Field>
          </div>
          {errors.jobs && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.jobs}
            </p>
          )}
        </div>
        {(["serviceTypeId", "modelId", "variantId"] as const).map((key) => {
          const label = {
            serviceTypeId: "Job type",
            modelId: "Model",
            variantId: "Variant",
          }[key];
          const list =
            key === "serviceTypeId"
              ? options.data?.serviceTypes
              : key === "modelId"
                ? options.data?.models
                : options.data?.variants.filter(
                    (row) => row.parentId === values.modelId,
                  );
          const available =
            !options.isPending &&
            !options.isError &&
            (key !== "variantId" ||
              (active.has("modelId") && !!values.modelId));
          return (
            <div key={key}>
              <AllToggle
                label={label}
                all={!active.has(key)}
                disabled={!available}
                onChange={(value) => toggle(key, value)}
              />
              <Field
                label={`Selected ${label.toLowerCase()}`}
                error={errors[key]}
              >
                <select
                  className={filterInput}
                  disabled={!active.has(key) || !available}
                  value={values[key]}
                  aria-invalid={!!errors[key]}
                  onChange={(event) => change(key, event.target.value)}
                >
                  <option value="">Select {label.toLowerCase()}</option>
                  {list?.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.description}
                    </option>
                  ))}
                </select>
              </Field>
              {key === "variantId" && !available && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a model to choose a variant.
                </p>
              )}
            </div>
          );
        })}
        <div>
          <AllToggle
            label="Registrations"
            all={!active.has("registration")}
            onChange={(value) => toggle("registration", value)}
          />
          <Field label="Registration number" error={errors.registration}>
            <input
              className={filterInput}
              value={values.registration}
              maxLength={40}
              disabled={!active.has("registration")}
              aria-invalid={!!errors.registration}
              onChange={(event) => change("registration", event.target.value)}
            />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="In the order of">
          <select
            className={inputCls}
            value={values.order}
            onChange={(event) => change("order", event.target.value)}
          >
            {Object.entries({
              CARD: "CSI card",
              JOB: "Job number",
              MODEL: "Model",
              REGISTRATION: "Registration",
            }).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? "Loading delivered jobs" : "Load delivered jobs"}
        </Button>
      </div>
    </form>
  );
}
