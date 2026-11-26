"use client";

import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/forms/FormField";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applicabilityLabels,
  type Applicability,
  type Attribute,
  type Master,
  type MasterKind,
  type Payload,
  type Rating,
  useCsiMasters,
  useSaveCsiMaster,
} from "../hooks/use-csi-masters";

type Row = { id: string; description: string; value: string };
type Problems = Record<string, string>;
const names = {
  attributes: "attribute",
  responses: "response",
  cards: "card",
} as const;
const weightPattern = /^([01])(?:\.(\d{1,6}))?$/;
const marksPattern = /^\d{1,6}(?:\.\d{1,6})?$/;

function weightUnits(value: string) {
  const parts = weightPattern.exec(value);
  return parts
    ? Number(parts[1]) * 1_000_000 + Number((parts[2] ?? "").padEnd(6, "0"))
    : 0;
}

function ChoiceRows({
  kind,
  branchId,
  rows,
  setRows,
  errors,
  readOnly,
}: {
  kind: "attributes" | "responses";
  branchId: string;
  rows: Row[];
  setRows: (rows: Row[]) => void;
  errors: Problems;
  readOnly: boolean;
}) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const options = useCsiMasters<Attribute | Rating>(
    kind,
    branchId,
    page,
    !readOnly,
  );
  const available = (options.data?.items ?? []).filter(
    (option) => option.active && !rows.some((row) => row.id === option.id),
  );
  const choice = available.find((option) => option.id === selected);
  const valueLabel = kind === "attributes" ? "Weightage" : "Marks";
  const field = valueLabel.toLowerCase();
  const name = names[kind];

  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 font-semibold">
        {kind === "attributes" ? "Attributes" : "Customer responses"}
      </legend>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Select a {name} below to add the first row.
        </p>
      )}
      {rows.map((row, index) => (
        <div
          key={row.id}
          className="grid items-end gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
        >
          <p className="min-w-0 break-words text-sm">
            {index + 1}. {row.description}
          </p>
          <Field
            label={valueLabel}
            required
            error={errors[kind + "." + index + "." + field]}
          >
            <Input
              inputMode="decimal"
              value={row.value}
              aria-label={valueLabel + " for " + row.description}
              aria-invalid={Boolean(errors[kind + "." + index + "." + field])}
              onChange={(event) =>
                setRows(
                  rows.map((item) =>
                    item.id === row.id
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </Field>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={"Remove " + row.description}
              onClick={() => setRows(rows.filter((item) => item.id !== row.id))}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {kind === "attributes" && (
        <p className="text-sm tabular-nums">
          Total weightage{" "}
          {rows.reduce((total, row) => total + weightUnits(row.value), 0) /
            1_000_000}{" "}
          of 1.0
        </p>
      )}
      {errors[kind] && (
        <p className="text-sm text-destructive" role="alert">
          {errors[kind]}
        </p>
      )}
      {!readOnly &&
        (options.isError ? (
          <div role="alert">
            <p>Could not load {kind}.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => options.refetch()}
            >
              Reload {kind}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label={kind === "attributes" ? "Attribute" : "Customer response"}
            >
              <select
                className={inputCls}
                value={selected}
                disabled={options.isPending || available.length === 0}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">
                  {options.isPending
                    ? "Loading choices"
                    : available.length
                      ? "Select a " + name
                      : "No available choices on this page"}
                </option>
                {available.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} {option.description}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!choice}
              onClick={() => {
                if (!choice) return;
                setRows([
                  ...rows,
                  {
                    id: choice.id,
                    description: choice.description,
                    value:
                      "weightage" in choice ? choice.weightage : choice.marks,
                  },
                ]);
                setSelected("");
              }}
            >
              {"Add " + name}
            </Button>
            {(page > 1 || options.data?.hasNext) && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => {
                    setSelected("");
                    setPage(page - 1);
                  }}
                >
                  Previous choices
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!options.data?.hasNext}
                  onClick={() => {
                    setSelected("");
                    setPage(page + 1);
                  }}
                >
                  Next choices
                </Button>
              </div>
            )}
          </div>
        ))}
    </fieldset>
  );
}

export function CsiMasterForm({
  kind,
  branchId,
  record,
  readOnly,
  onClose,
}: {
  kind: MasterKind;
  branchId: string;
  record?: Master;
  readOnly: boolean;
  onClose: () => void;
}) {
  const card = record && "revisions" in record ? record : undefined;
  const revision = card?.revisions[0];
  const [code, setCode] = useState(record?.code ?? "");
  const [description, setDescription] = useState(
    record && "description" in record
      ? record.description
      : (revision?.description ?? ""),
  );
  const [shortDescription, setShortDescription] = useState(
    record && "shortDescription" in record ? record.shortDescription : "",
  );
  const [value, setValue] = useState(
    record && "weightage" in record
      ? record.weightage
      : record && "marks" in record
        ? record.marks
        : "",
  );
  const [active, setActive] = useState(record?.active ?? true);
  const [cardDate, setCardDate] = useState(
    revision?.cardDate.slice(0, 10) ?? "",
  );
  const [effectiveDate, setEffectiveDate] = useState(
    revision?.effectiveDate.slice(0, 10) ?? "",
  );
  const [appliesTo, setAppliesTo] = useState<Applicability>(
    revision?.appliesTo ?? "NON_ACCIDENTAL",
  );
  const [attributes, setAttributes] = useState<Row[]>(
    revision?.attributes.map((row) => ({
      id: row.attributeId,
      description: row.description,
      value: row.weightage,
    })) ?? [],
  );
  const [responses, setResponses] = useState<Row[]>(
    revision?.responses.map((row) => ({
      id: row.responseId,
      description: row.description,
      value: row.marks,
    })) ?? [],
  );
  const [errors, setErrors] = useState<Problems>({});
  const [failure, setFailure] = useState("");
  const submitting = useRef(false);
  const save = useSaveCsiMaster(kind, branchId, record?.id);
  const name = names[kind];
  const valueField = kind === "attributes" ? "weightage" : "marks";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || submitting.current) return;
    setFailure("");
    const problems: Problems = {};
    if (!/^[A-Z0-9-]{1,20}$/.test(code.trim().toUpperCase()))
      problems.code = "Use 1 to 20 letters, digits or hyphens.";
    if (!description.trim()) problems.description = "Enter a description.";
    if (kind === "attributes") {
      if (!shortDescription.trim())
        problems.shortDescription = "Enter a short description.";
      if (!weightPattern.test(value) || weightUnits(value) > 1_000_000)
        problems.weightage =
          "Enter a weight from 0 to 1 with up to six decimal places.";
    }
    if (
      kind === "responses" &&
      (!marksPattern.test(value) || Number(value) <= 0)
    )
      problems.marks =
        "Enter marks greater than 0 with up to six decimal places.";
    if (kind === "cards") {
      if (!cardDate) problems.cardDate = "Enter the card date.";
      if (!effectiveDate) problems.effectiveDate = "Enter the effective date.";
    }
    setErrors(problems);
    if (Object.keys(problems).length) return;

    const base = { code, description, active };
    const data: Payload =
      kind === "attributes"
        ? { ...base, shortDescription, weightage: value }
        : kind === "responses"
          ? { ...base, marks: value }
          : {
              ...base,
              cardDate,
              effectiveDate,
              appliesTo,
              ...(card ? { version: card.version } : {}),
              attributes: attributes.map((row) => ({
                attributeId: row.id,
                weightage: row.value,
              })),
              responses: responses.map((row) => ({
                responseId: row.id,
                marks: row.value,
              })),
            };
    submitting.current = true;
    save.mutate(data, {
      onSuccess: () => {
        toast.success("CSI " + name + " saved");
        onClose();
      },
      onError: (error) => {
        const response =
          "response" in error
            ? (error.response as {
                data?: {
                  message?: string;
                  errors?: { field: string; message: string }[];
                };
              })
            : undefined;
        const details = response?.data;
        if (details?.errors?.length)
          setErrors(
            Object.fromEntries(
              details.errors.map((item) => [item.field, item.message]),
            ),
          );
        else {
          const message =
            details?.message ??
            "Could not save the CSI " + name + ". Try again.";
          setFailure(message);
          toast.error(message);
        }
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <section className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={
          (readOnly ? "View CSI " : record ? "Edit CSI " : "Add CSI ") + name
        }
      />
      <form noValidate onSubmit={submit} className="space-y-4">
        <fieldset
          disabled={readOnly || save.isPending}
          className="min-w-0 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" required error={errors.code}>
              <Input
                required
                maxLength={20}
                value={code}
                aria-invalid={Boolean(errors.code)}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            <Field label="Description" required error={errors.description}>
              <Input
                required
                maxLength={300}
                value={description}
                aria-invalid={Boolean(errors.description)}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            {kind === "attributes" && (
              <Field
                label="Short description"
                required
                error={errors.shortDescription}
              >
                <Input
                  required
                  maxLength={120}
                  value={shortDescription}
                  aria-invalid={Boolean(errors.shortDescription)}
                  onChange={(event) => setShortDescription(event.target.value)}
                />
              </Field>
            )}
            {kind !== "cards" && (
              <Field
                label={kind === "attributes" ? "Weightage" : "Marks"}
                required
                error={errors[valueField]}
              >
                <Input
                  required
                  inputMode="decimal"
                  value={value}
                  aria-invalid={Boolean(errors[valueField])}
                  onChange={(event) => setValue(event.target.value)}
                />
              </Field>
            )}
            {kind === "cards" && (
              <>
                <Field label="Card date" required error={errors.cardDate}>
                  <Input
                    required
                    type="date"
                    value={cardDate}
                    aria-invalid={Boolean(errors.cardDate)}
                    onChange={(event) => setCardDate(event.target.value)}
                  />
                </Field>
                <Field
                  label="Effective date"
                  required
                  error={errors.effectiveDate}
                >
                  <Input
                    required
                    type="date"
                    value={effectiveDate}
                    aria-invalid={Boolean(errors.effectiveDate)}
                    onChange={(event) => setEffectiveDate(event.target.value)}
                  />
                </Field>
                <Field label="CSI card applies to" required>
                  <select
                    className={inputCls}
                    value={appliesTo}
                    onChange={(event) =>
                      setAppliesTo(event.target.value as Applicability)
                    }
                  >
                    {Object.entries(applicabilityLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active
            </label>
          </div>
          {kind === "cards" && (
            <>
              <ChoiceRows
                kind="attributes"
                branchId={branchId}
                rows={attributes}
                setRows={setAttributes}
                errors={errors}
                readOnly={readOnly}
              />
              <ChoiceRows
                kind="responses"
                branchId={branchId}
                rows={responses}
                setRows={setResponses}
                errors={errors}
                readOnly={readOnly}
              />
            </>
          )}
        </fieldset>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving " + name : "Save " + name}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={onClose}
          >
            {readOnly ? "Back to list" : "Cancel"}
          </Button>
        </div>
      </form>
    </section>
  );
}
