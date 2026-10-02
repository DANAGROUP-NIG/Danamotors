"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/apiClient";
import { PageHeader } from "@/components/headers/page-header";
import { DataTable } from "@/components/ui/table-components/DataTable";
import { WorkshopPicker } from "@/features/job-cards/components/WorkshopPicker";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";

type Rate = {
  id: string;
  labourItemId: string;
  modelId: string;
  pricing: string;
  hours: number;
  rate: number;
  active: boolean;
  model: {
    description: string;
  };
  labourItem: {
    description: string;
  };
};

export default function LabourRatesPage() {
  const {
    isAdminOrAbove,
  } = useAuth();

  const queryClient = useQueryClient();
  const [modelId, setModelId] = useState("");
  const [labourItemId, setLabourItemId] = useState("");
  const [pricing, setPricing] = useState("TIME");
  const [hours, setHours] = useState(1);
  const [rate, setRate] = useState(0);

  const query = useQuery({
    queryKey: ["labour-rates", modelId],

    queryFn: () => apiGet<{
      rates: Rate[];
    }>(`/service/labour-rates${modelId ? `?modelId=${modelId}` : ""}`),
  });

  const save = useMutation({
    mutationFn: (
      data: {
        modelId: string;
        labourItemId: string;
        pricing: string;
        hours: number;
        rate: number;
        active: boolean;
      },
    ) => apiPost("/service/labour-rates", data),

    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ["labour-rates"],
    }),
  });

  return (
    <div className="grid gap-5 p-5"><PageHeader title="Model labour rates" description="Fixed amounts or hours multiplied by an hourly rate." /><WorkshopPicker
        label="Model"
        endpoint="/workshop-masters?kind=MODEL"
        collection="items"
        value={modelId}
        onChange={setModelId} />
      {isAdminOrAbove && <form
        className="grid gap-3"
        onSubmit={e => {
          e.preventDefault();

          save.mutate({
            modelId,
            labourItemId,
            pricing,
            hours,
            rate,
            active: true,
          });
        }}><WorkshopPicker
          required
          label="Labour operation"
          endpoint="/service/labour-items"
          collection="labourItems"
          value={labourItemId}
          onChange={setLabourItemId} /><Field label="Pricing"><select className={inputCls} value={pricing} onChange={e => setPricing(e.target.value)}><option>TIME</option><option>FIXED</option></select></Field><Field label="Default hours"><input
            type="number"
            min="0.01"
            step="0.01"
            className={inputCls}
            value={hours}
            onChange={e => setHours(Number(e.target.value))} /></Field><Field label={pricing === "FIXED" ? "Fixed amount" : "Hourly rate"}><input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={rate}
            onChange={e => setRate(Number(e.target.value))} /></Field><Button disabled={!modelId || !labourItemId || save.isPending}>Save model rate</Button></form>}
      {(query.isError || save.isError) && <p role="alert" className="text-red-600">Could not load or save rates.</p>}
      <DataTable
        data={query.data?.rates ?? []}
        rowKey={row => row.id}
        isLoading={query.isLoading}
        columns={[{
          header: "Model",
          render: r => r.model.description,
        }, {
          header: "Operation",
          render: r => r.labourItem.description,
        }, {
          header: "Rate",
          render: r => `${r.pricing}: ${r.hours} h / NGN ${r.rate}`,
        }, {
          header: "Actions",

          render: r => isAdminOrAbove && <div className="flex gap-2"><Button
              size="sm"
              variant="outline"
              onClick={() => {
                setModelId(r.modelId);
                setLabourItemId(r.labourItemId);
                setPricing(r.pricing);
                setHours(r.hours);
                setRate(r.rate);
              }}>Edit</Button><Button
              size="sm"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate({
                modelId: r.modelId,
                labourItemId: r.labourItemId,
                pricing: r.pricing,
                hours: r.hours,
                rate: r.rate,
                active: !r.active,
              })}>{r.active ? "Deactivate" : "Activate"}</Button></div>,
        }]} />
    </div>
  );
}
