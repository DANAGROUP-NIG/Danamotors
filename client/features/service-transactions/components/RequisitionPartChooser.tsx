"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { usePart } from "@/features/inventory/hooks/use-parts";
import {
  PART_SOURCE_LABELS,
  partSourceLabel,
} from "@/features/inventory/lib/part-codes";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRequisitionPartOptions } from "../hooks/use-requisition-part-options";
import { moneyText } from "../transaction.logic";

const relationships = {
  requested: "Requested part",
  main: "Main catalogue part",
  alternate: "Registered alternate",
  source: "Other source record",
};
export function RequisitionPartChooser({
  requestedId,
  actualId,
  branchId,
  label,
  chargeType,
  onRequested,
  onSupply,
}: {
  requestedId: string;
  actualId: string;
  branchId: string;
  label: string;
  chargeType: string;
  onRequested: (id: string) => void;
  onSupply: (id: string) => void;
}) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("sparepart:read");
  const canChoose =
    canRead &&
    hasPermission("stock:read") &&
    hasPermission("requisition:create");
  const requested = usePart(canRead ? requestedId : "");
  const actual = usePart(canRead ? actualId : "");
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const choices = useRequisitionPartOptions(
    requestedId,
    branchId,
    page,
    source,
    debounced,
    open && canChoose,
  );
  if (!canRead)
    return (
      <p className="text-sm text-muted-foreground">
        Part details are unavailable with your permissions.
      </p>
    );
  return (
    <div className="space-y-3">
      {requestedId && requested.isLoading ? (
        <p role="status">Loading requested part</p>
      ) : requestedId && !requested.data ? (
        <div className="space-y-2">
          <p role="alert">Requested part details could not be loaded.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => requested.refetch()}
          >
            Retry part details
          </Button>
        </div>
      ) : (
        <WorkshopPicker
          label={label}
          endpoint={`/inventory/parts?branchId=${branchId}`}
          collection="parts"
          value={requestedId}
          selectedRecord={
            requested.data
              ? {
                  id: requestedId,
                  partNumber: requested.data.partNumber,
                  name: requested.data.name,
                }
              : undefined
          }
          onChange={onRequested}
        />
      )}
      {actualId && actual.isLoading && <p role="status">Loading supply part</p>}
      {actual.data && (
        <p className="text-sm">
          Part to supply: {actual.data.partNumber}, {actual.data.name}. Source:{" "}
          {PART_SOURCE_LABELS[actual.data.partFlag] ?? "Other source"}.
        </p>
      )}
      {actualId && actual.isError && (
        <div className="space-y-2">
          <p role="alert">Supply part details could not be loaded.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => actual.refetch()}
          >
            Retry supply details
          </Button>
        </div>
      )}
      {actual.data?.partStatus === "BLOCKED" && (
        <p role="alert" className="text-sm text-destructive">
          This part is blocked for issue. Choose an active registered alternate
          or source.
        </p>
      )}
      {!requestedId && (
        <p className="text-sm text-muted-foreground">
          Choose a requested part to browse registered alternates and other
          sources.
        </p>
      )}
      {!!requestedId && !canChoose && (
        <p className="text-sm text-muted-foreground">
          Alternate selection requires requisition, part and stock access.
        </p>
      )}
      {!!requestedId && canChoose && (
        <details
          className="space-y-3 rounded-lg border border-border p-3"
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer font-medium">
            Alternates and other sources
          </summary>
          <p className="text-sm text-muted-foreground">
            Only linked catalogue records are shown. Confirm fitment and
            approved estimate scope before issuing. Selecting a different part
            sets issued quantity to zero.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Part source">
              <select
                className={inputCls}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All sources</option>
                {Object.keys(PART_SOURCE_LABELS).map((code) => (
                  <option key={code} value={code}>
                    {partSourceLabel(code)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Find an alternative">
              <input
                className={inputCls}
                type="search"
                maxLength={100}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          {choices.isLoading && (
            <p role="status">Loading part alternatives and branch stock</p>
          )}
          {choices.isError && (
            <div className="space-y-2">
              <p role="alert">
                Part alternatives could not be loaded. Retry before choosing a
                substitute.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => choices.refetch()}
              >
                Retry alternatives
              </Button>
            </div>
          )}
          {choices.data && !choices.data.options.length && (
            <p className="text-sm text-muted-foreground">
              No active linked parts match these filters. Clear the filters or
              register a source in Part Master.
            </p>
          )}
          {!!choices.data?.options.length && (
            <ul className="space-y-3">
              {choices.data.options.map((option) => {
                const selected = option.id === actualId;
                const ineligible =
                  chargeType === "WARRANTY" && !option.warrantyApplicable;
                return (
                  <li
                    key={option.id}
                    className="space-y-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="wrap-break-word font-medium">
                          {option.partNumber}, {option.name}
                        </p>
                        <p>
                          {option.sourceLabel},{" "}
                          {relationships[option.relationship] ?? "Linked part"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={selected || ineligible}
                        onClick={() => onSupply(option.id)}
                      >
                        {selected ? "Selected" : "Choose supply part"}
                      </Button>
                    </div>
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt>Available at this branch</dt>
                        <dd className="text-right tabular-nums">
                          {option.available.toLocaleString("en-NG")}
                        </dd>
                      </div>
                      <div>
                        <dt>
                          {chargeType === "WARRANTY"
                            ? "Warranty rate"
                            : "Normal rate"}
                        </dt>
                        <dd className="text-right tabular-nums">
                          {moneyText(
                            chargeType === "WARRANTY"
                              ? option.warrantyRate
                              : option.normalRate,
                          )}
                        </dd>
                      </div>
                    </dl>
                    {option.available === 0 && (
                      <p className="text-muted-foreground">
                        No available branch stock. Save a request with zero
                        issued or choose another option.
                      </p>
                    )}
                    {ineligible && (
                      <p className="text-destructive">
                        This source is not eligible for warranty.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!!choices.data && choices.data.meta.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1 || choices.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous options
              </Button>
              <span className="text-sm">
                Page {page} of {choices.data.meta.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={
                  page >= choices.data.meta.totalPages || choices.isFetching
                }
                onClick={() => setPage((value) => value + 1)}
              >
                Next options
              </Button>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
