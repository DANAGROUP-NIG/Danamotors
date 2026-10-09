"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import ModalFame from "@/components/modals/ModalFame";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ServiceTypeModelSettings } from "./service-type-model-settings";

type Master = {
  id: string;
  code: string;
  description: string;
  active: boolean;
  parentId?: string | null;
  category?: string | null;
  chargedTo?: string;
  freeService?: boolean;
  displayOrder?: number | null;
  preDelivery?: boolean;
  fuel?: string | null;
  gearbox?: string | null;
  acFitted?: boolean;
  warrantyDays?: number | null;
  warrantyKm?: number | null;
};

const kinds = [
  "SERVICE_TYPE",
  "BAY",
  "COMPLAINT",
  "TEAM",
  "LATE_REASON",
  "MAKE",
  "PRODUCT",
  "MODEL",
  "VARIANT",
  "COLOUR",
  "TYRE_MAKE",
  "BATTERY_MAKE",
];

const parentKinds: Record<string, string> = {
  PRODUCT: "MAKE",
  MODEL: "PRODUCT",
  VARIANT: "MODEL",
  COLOUR: "MODEL",
};

export function WorkshopMastersPage() {
  const {
    isAdminOrAbove,
  } = useAuth();

  const queryClient = useQueryClient();
  const [kind, setKind] = useState("SERVICE_TYPE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Master | null>(null);

  const query = useQuery({
    queryKey: ["workshop-masters", kind, search, page],

    queryFn: () => apiGet<{
      items: Master[];
      meta: {
        total: number;
        totalPages: number;
      };
    }>(
      `/workshop-masters?kind=${kind}&includeInactive=true&page=${page}&limit=20&search=${encodeURIComponent(search)}`,
    ),
  });

  const save = useMutation({
    mutationFn: (record: Master) => {
      const payload = {
        code: record.code,
        description: record.description,
        active: record.active,
        parentId: record.parentId,
        category: record.category,
        chargedTo: record.chargedTo,
        freeService: record.freeService,
        displayOrder: kind === "SERVICE_TYPE" ? record.displayOrder : undefined,
        preDelivery: kind === "SERVICE_TYPE" ? record.preDelivery : undefined,
        fuel: record.fuel,
        gearbox: record.gearbox,
        acFitted: record.acFitted,
        warrantyDays: record.warrantyDays,
        warrantyKm: record.warrantyKm,
      };

      return record.id ? apiPut(`/workshop-masters/${record.id}`, payload) : apiPost("/workshop-masters", {
        ...payload,
        kind,
      });
    },

    onSuccess: () => {
      setForm(null);

      queryClient.invalidateQueries({
        queryKey: ["workshop-masters"],
      });

      queryClient.invalidateQueries({
        queryKey: ["workshop-picker"],
      });
      queryClient.invalidateQueries({ queryKey: ["job-card-service-types"] });
    },
  });

  return (
    <div className="grid gap-5 p-4 lg:p-6">
      <PageHeader
        title="Workshop master data"
        description="Maintain legacy codes, workshop lists and vehicle catalogue entries." />
      <Link className="text-primary underline" href="/labour-catalogue">Labour operations</Link>
      <Link className="text-primary underline" href="/settings/labour-rates">Model labour rates</Link>
      <div className="flex gap-3"><select
          className={inputCls}
          value={kind}
          onChange={e => {
            setKind(e.target.value);
            setPage(1);
          }}>{kinds.map(value => <option key={value}>{value}</option>)}</select><input
          aria-label="Search masters"
          className={inputCls}
          value={search}
          placeholder="Search code or description"
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }} />{isAdminOrAbove && <Button
          onClick={() => setForm({
            id: "",
            code: "",
            description: "",
            active: true,
          })}>Create</Button>}</div>
      {query.isError && <p role="alert" className="text-red-600">Could not load master data. <button onClick={() => query.refetch()}>Retry</button></p>}
      <DataTable
        data={query.data?.items ?? []}
        rowKey={row => row.id}
        isLoading={query.isLoading}
        page={page}
        pageSize={20}
        total={query.data?.meta.total}
        totalPages={query.data?.meta.totalPages}
        onPageChange={setPage}
        columns={[{
          header: "Code",
          render: row => row.code,
        }, {
          header: "Description",
          render: row => row.description,
        }, {
          header: "Status",
          render: row => <StatusBadge status={row.active ? "Active" : "Inactive"} tone={row.active ? "emerald" : "gray"} />,
        }, {
          header: "Actions",
          render: row => isAdminOrAbove && <Button variant="outline" size="sm" onClick={() => setForm(row)}>Edit</Button>,
        }]} />
      <ModalFame isOpen={!!form} size={kind === "SERVICE_TYPE" ? "wide" : "default"} title={form?.id ? "Edit master" : "Create master"} onClose={() => setForm(null)}>{form && <form
          className="grid gap-3 p-5"
          onSubmit={e => {
            e.preventDefault();
            save.mutate(form);
          }}>
          <Field label="Code"><input
              required
              className={inputCls}
              value={form.code}
              onChange={e => setForm({
                ...form,
                code: e.target.value,
              })} /></Field>
          <Field label="Description"><input
              required
              className={inputCls}
              value={form.description}
              onChange={e => setForm({
                ...form,
                description: e.target.value,
              })} /></Field>
          {parentKinds[kind] && <WorkshopPicker
            required
            label={parentKinds[kind]}
            endpoint={`/workshop-masters?kind=${parentKinds[kind]}`}
            collection="items"
            value={form.parentId ?? ""}
            disabled={!!form.id}
            onChange={id => setForm({
              ...form,
              parentId: id,
            })} />}
          {kind === "SERVICE_TYPE" && <><Field label="Charged to"><select
                className={inputCls}
                value={form.chargedTo ?? "CUSTOMER"}
                onChange={e => setForm({
                  ...form,
                  chargedTo: e.target.value,
                })}><option>CUSTOMER</option><option>COMPANY</option></select></Field><label><input
                type="checkbox"
                checked={form.freeService ?? false}
                onChange={e => setForm({
                  ...form,
                  freeService: e.target.checked,
                })} />Free service</label></>}
          {kind === "SERVICE_TYPE" && <>
            <Field label="Display order"><input className={inputCls} type="number" min="0" max="100000" step="1"
              value={form.displayOrder ?? ""} onChange={event => setForm({ ...form, displayOrder: event.target.value === "" ? null : Number(event.target.value) })} /></Field>
            <label className="flex gap-2"><input type="checkbox" checked={form.preDelivery ?? false}
              onChange={event => setForm({ ...form, preDelivery: event.target.checked })} />Pre-delivery service (unsold vehicles only)</label>
          </>}
          {kind === "BAY" && <Field label="Category"><input
              className={inputCls}
              value={form.category ?? ""}
              onChange={e => setForm({
                ...form,
                category: e.target.value,
              })} /></Field>}
          {kind === "MODEL" && <>{(["warrantyDays", "warrantyKm"] as const).map(key => <Field key={key} label={key === "warrantyDays" ? "Warranty days" : "Warranty km"}><input
                type="number"
                min="0"
                className={inputCls}
                value={form[key] ?? ""}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value ? Number(e.target.value) : null,
                })} /></Field>)}</>}
          {kind === "VARIANT" && <>{(["fuel", "gearbox"] as const).map(key => <Field key={key} label={key}><input
                className={inputCls}
                value={form[key] ?? ""}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value,
                })} /></Field>)}<label><input
                type="checkbox"
                checked={form.acFitted ?? false}
                onChange={e => setForm({
                  ...form,
                  acFitted: e.target.checked,
                })} />AC fitted</label></>}
          <label><input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm({
                ...form,
                active: e.target.checked,
              })} />Active</label>
          {save.isError && <p role="alert" className="text-red-600">Could not save. Check unique code and parent selection.</p>}
          <Button disabled={save.isPending}>Save master</Button>
        </form>}
        {form?.id && kind === "SERVICE_TYPE" && <ServiceTypeModelSettings key={form.id} serviceTypeId={form.id} />}
        {form && !form.id && kind === "SERVICE_TYPE" && <p className="px-5 pb-5 text-sm text-muted-foreground">Save the service type first, then edit it to configure model charges.</p>}
      </ModalFame>
    </div>
  );
}
