"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useUpdateService } from "../hooks/use-update-service";
import {
  updateServiceSchema,
  type UpdateServiceFormValues,
} from "../schemas/service-catalog.schema";
import type { ServiceItem } from "../types/service-catalog.types";

interface ServiceEditFormProps {
  service: ServiceItem;
  onSuccess?: () => void;
}

export function ServiceEditForm({
  service,
  onSuccess,
}: ServiceEditFormProps) {
  const update = useUpdateService(service.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateServiceFormValues>({
    resolver: zodResolver(updateServiceSchema),
    defaultValues: {
      name: service.name,
      category: service.category ?? "",
      durationMins: service.durationMins != null ? String(service.durationMins) : "",
      price: service.price != null ? String(service.price) : "",
      description: service.description ?? "",
      isActive: service.isActive,
    },
  });

  useEffect(() => {
    reset({
      name: service.name,
      category: service.category ?? "",
      durationMins: service.durationMins != null ? String(service.durationMins) : "",
      price: service.price != null ? String(service.price) : "",
      description: service.description ?? "",
      isActive: service.isActive,
    });
  }, [service, reset]);

  function onSubmit(values: UpdateServiceFormValues) {
    update.mutate(
      {
        name: values.name,
        description: values.description || undefined,
        category: values.category || undefined,
        durationMins: values.durationMins
          ? Number(values.durationMins)
          : undefined,
        price: values.price ? Number(values.price) : undefined,
        isActive: values.isActive,
      },
      { onSuccess },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Service name" error={errors.name?.message}>
        <input className={inputCls} {...register("name")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message}>
          <input className={inputCls} placeholder="e.g. Maintenance" {...register("category")} />
        </Field>
        <Field label="Duration (minutes)" error={errors.durationMins?.message}>
          <input type="number" className={inputCls} {...register("durationMins")} />
        </Field>
      </div>

      <Field label="Price" error={errors.price?.message}>
        <input type="number" step="0.01" className={inputCls} {...register("price")} />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          {...register("description")}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 rounded border-border accent-primary"
          {...register("isActive")}
        />
        Active (available for booking)
      </label>

      <Button type="submit" disabled={update.isPending} size="sm">
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
