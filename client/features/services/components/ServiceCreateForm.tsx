"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useCreateService } from "../hooks/use-create-service";
import {
  createServiceSchema,
  type CreateServiceFormValues,
} from "../schemas/service-catalog.schema";

interface ServiceCreateFormProps {
  onSuccess?: () => void;
}

export function ServiceCreateForm({ onSuccess }: ServiceCreateFormProps) {
  const create = useCreateService();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateServiceFormValues>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      isActive: true,
    },
  });

  function onSubmit(values: CreateServiceFormValues) {
    create.mutate(
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
      {
        onSuccess: () => {
          reset();
          onSuccess?.();
        },
      },
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <Field label="Service name" error={errors.name?.message}>
        <input
          className={inputCls}
          placeholder="e.g. Full Service"
          {...register("name")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message}>
          <input
            className={inputCls}
            placeholder="e.g. Maintenance"
            {...register("category")}
          />
        </Field>
        <Field label="Duration (minutes)" error={errors.durationMins?.message}>
          <input
            type="number"
            className={inputCls}
            placeholder="e.g. 120"
            {...register("durationMins")}
          />
        </Field>
      </div>

      <Field label="Price" error={errors.price?.message}>
        <input
          type="number"
          step="0.01"
          className={inputCls}
          placeholder="e.g. 85000"
          {...register("price")}
        />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <textarea
          className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="What does this service include?"
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

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add service"}
      </Button>
    </form>
  );
}
