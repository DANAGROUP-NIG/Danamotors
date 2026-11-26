"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Field, inputCls } from "@/components/forms/FormField";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { WARRANTY_PERMISSIONS } from "@/features/auth/roles";
import { formatDateTime } from "@/lib/format";
import { useSaveServiceRule, useServiceRule } from "../hooks/use-warranty";
import { apiErrorMessage } from "../lib/warranty-format";
import { SERVICES_PER_YEAR, serviceRuleSchema, type ServiceRuleValues } from "../schemas/service-rule.schema";
import type { ServiceRuleSettings } from "../types/warranty.types";

const toValues = (rule: ServiceRuleSettings): ServiceRuleValues => ({
  serviceIntervalMonths: String(rule.serviceIntervalMonths),
  serviceIntervalKm: String(rule.serviceIntervalKm),
  servicesPerYear: String(rule.servicesPerYear) as ServiceRuleValues["servicesPerYear"],
  serviceGraceKm: String(rule.serviceGraceKm),
  serviceGraceDays: String(rule.serviceGraceDays),
});

/**
 * Warranty settings, Service history rule: a service at least every N months or N km, whichever
 * comes first, in every warranty year. A vehicle model can override each value on its policy.
 */
export function ServiceRuleSettingsPanel() {
  const { hasPermission, isSuperAdmin } = useAuth();
  const canEdit = isSuperAdmin || hasPermission(WARRANTY_PERMISSIONS.SETTINGS);
  const query = useServiceRule();
  const save = useSaveServiceRule();
  const form = useForm<ServiceRuleValues>({ resolver: zodResolver(serviceRuleSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (query.data) form.reset(toValues(query.data));
  }, [query.data, form]);

  if (query.isLoading) return <LoadingSkeleton label="Loading the service history rule" />;
  if (query.isError || !query.data)
    return (
      <div className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-5 text-sm">
        <p role="alert">The service history rule could not be loaded. Check your connection and try again.</p>
        <div>
          <Button type="button" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    );

  const submit = form.handleSubmit((values) => {
    if (save.isPending) return;
    save.mutate(
      {
        serviceIntervalMonths: Number(values.serviceIntervalMonths),
        serviceIntervalKm: Number(values.serviceIntervalKm),
        servicesPerYear: Number(values.servicesPerYear),
        serviceGraceKm: Number(values.serviceGraceKm),
        serviceGraceDays: Number(values.serviceGraceDays),
      },
      { onError: (error) => toast.error(apiErrorMessage(error, "The rule was not saved. Check your connection and try again.")) },
    );
  });

  return (
    <form className="grid max-w-2xl gap-5 rounded-xl border border-border bg-card p-5" noValidate onSubmit={submit}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Service history rule</h2>
        <p className="text-sm text-muted-foreground">
          In every warranty year since the sale, the vehicle must be serviced at least this often, whichever comes first. A longer gap is a missed service. Only service types
          marked Periodic maintenance in Workshop masters count. A model policy can set its own values.
        </p>
      </div>
      <fieldset disabled={!canEdit || save.isPending} className="grid gap-4 sm:grid-cols-2">
        <Field label="Service every (months)" required error={errors.serviceIntervalMonths?.message}>
          <input className={inputCls} inputMode="numeric" {...form.register("serviceIntervalMonths")} />
        </Field>
        <Field label="Or every (km)" required error={errors.serviceIntervalKm?.message}>
          <input className={inputCls} inputMode="numeric" {...form.register("serviceIntervalKm")} />
        </Field>
        <Field label="Services per year" required error={errors.servicesPerYear?.message}>
          <select className={inputCls} {...form.register("servicesPerYear")}>
            {SERVICES_PER_YEAR.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">Splits each warranty year on the service history grid. 4 gives quarters.</span>
        </Field>
        <div className="hidden sm:block" />
        <Field label="Grace (days)" required error={errors.serviceGraceDays?.message}>
          <input className={inputCls} inputMode="numeric" {...form.register("serviceGraceDays")} />
          <span className="text-xs text-muted-foreground">Extra days allowed after a service falls due. 0 means none.</span>
        </Field>
        <Field label="Grace (km)" required error={errors.serviceGraceKm?.message}>
          <input className={inputCls} inputMode="numeric" {...form.register("serviceGraceKm")} />
          <span className="text-xs text-muted-foreground">Extra km allowed above the km limit. 0 means none.</span>
        </Field>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {canEdit ? `Last changed ${formatDateTime(query.data.updatedAt)}.` : "Only staff with warranty settings access can change the rule."}
        </p>
        {canEdit && (
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {save.isPending ? "Saving rule" : "Save rule"}
          </Button>
        )}
      </div>
    </form>
  );
}
