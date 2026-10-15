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
import { MASTER_KIND_GROUPS, MASTER_KINDS, type AttributeField } from "./master-kinds";

type Master = {
  id: string;
  code: string;
  description: string;
  shortDescription?: string | null;
  attributes?: Record<string, unknown> | null;
  active: boolean;
  parentId?: string | null;
  parent?: { code: string; description: string } | null;
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

function AttributeInput({ field, value, onChange }: {
  field: AttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "checkbox")
    return <label className="flex gap-2"><input
        type="checkbox"
        checked={value === true}
        onChange={e => onChange(e.target.checked)} />{field.label}</label>;

  if (field.type === "select")
    return <Field label={field.label}><select
        className={inputCls}
        value={typeof value === "string" ? value : ""}
        onChange={e => onChange(e.target.value || null)}><option value="">Not set</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>;

  if (field.type === "textarea")
    return <Field label={field.label}><textarea
        className={inputCls}
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={e => onChange(e.target.value || null)} /></Field>;

  return <Field label={field.label}><input
      className={inputCls}
      type={field.type}
      min={field.type === "number" ? 1 : undefined}
      value={value == null ? "" : String(value)}
      onChange={e => onChange(e.target.value === "" ? null : field.type === "number" ? Number(e.target.value) : e.target.value)} /></Field>;
}

export function WorkshopMastersPage() {
  const {
    isAdminOrAbove,
  } = useAuth();

  const queryClient = useQueryClient();
  const [kind, setKind] = useState("SERVICE_TYPE");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Master | null>(null);
  const config = MASTER_KINDS[kind];

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
        shortDescription: record.shortDescription || null,
        attributes: config.attributes ? record.attributes ?? {} : undefined,
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
          }}>{MASTER_KIND_GROUPS.map(group => <optgroup key={group} label={group}>{Object.entries(MASTER_KINDS).filter(([, value]) => value.group === group).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</optgroup>)}</select><input
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
          header: "Short",
          render: row => row.shortDescription ?? "",
        }, {
          header: "Description",
          render: row => row.description,
        }, ...(config.parent ? [{
          header: config.parent.label,
          render: (row: Master) => row.parent ? `${row.parent.code} | ${row.parent.description}` : "",
        }] : []), {
          header: "Status",
          render: row => <StatusBadge status={row.active ? "Active" : "Inactive"} tone={row.active ? "emerald" : "gray"} />,
        }, {
          header: "Actions",
          render: row => isAdminOrAbove && <Button variant="outline" size="sm" onClick={() => setForm(row)}>Edit</Button>,
        }]} />
      <ModalFame isOpen={!!form} size={kind === "SERVICE_TYPE" ? "wide" : "default"} title={`${form?.id ? "Edit" : "Create"} ${config.label.toLowerCase()}`} onClose={() => setForm(null)}>{form && <form
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
          <Field label="Short description"><input
              className={inputCls}
              maxLength={50}
              value={form.shortDescription ?? ""}
              onChange={e => setForm({
                ...form,
                shortDescription: e.target.value,
              })} /></Field>
          {config.parent && <WorkshopPicker
            required={config.parent.required}
            label={config.parent.label}
            endpoint={`/workshop-masters?kind=${config.parent.kind}`}
            collection="items"
            value={form.parentId ?? ""}
            disabled={!!form.id && config.parent.fixed}
            onChange={id => setForm({
              ...form,
              parentId: id || null,
            })} />}
          {config.attributes?.map(field => <AttributeInput
            key={field.key}
            field={field}
            value={form.attributes?.[field.key]}
            onChange={value => setForm({
              ...form,
              attributes: {
                ...form.attributes,
                [field.key]: value,
              },
            })} />)}
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
          {kind === "BAY" && <Field label="Bay group"><input
              className={inputCls}
              value={form.category ?? ""}
              onChange={e => setForm({
                ...form,
                category: e.target.value,
              })} /></Field>}
          {(kind === "MODEL" || kind === "VARIANT") && <>{(["fuel", "gearbox"] as const).filter(key => kind === "VARIANT" || key === "fuel").map(key => <Field key={key} label={key === "fuel" ? "Fuel" : "Gearbox"}><input
                className={inputCls}
                value={form[key] ?? ""}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value,
                })} /></Field>)}<label className="flex gap-2"><input
                type="checkbox"
                checked={form.acFitted ?? false}
                onChange={e => setForm({
                  ...form,
                  acFitted: e.target.checked,
                })} />AC fitted</label></>}
          {kind === "MODEL" && <>{(["warrantyDays", "warrantyKm"] as const).map(key => <Field key={key} label={key === "warrantyDays" ? "Warranty days" : "Warranty km"}><input
                type="number"
                min="0"
                className={inputCls}
                value={form[key] ?? ""}
                onChange={e => setForm({
                  ...form,
                  [key]: e.target.value ? Number(e.target.value) : null,
                })} /></Field>)}</>}
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
