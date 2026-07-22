"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUpdateUser } from "../hooks/use-update-user";
import { useRoles } from "../hooks/use-roles";
import {
  updateUserSchema,
  type UpdateUserFormValues,
} from "../schemas/user.schema";
import type { User } from "../types/user.types";

interface UserEditFormProps {
  user: User;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function UserEditForm({
  user,
  onSuccess,
  onCancel,
}: UserEditFormProps) {
  const update = useUpdateUser(user.id);
  const { data: rolesData } = useRoles();
  const roles = rolesData?.roles ?? [];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber ?? "",
      roleId: user.roleId,
      isActive: user.isActive,
    },
  });

  useEffect(() => {
    reset({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber ?? "",
      roleId: user.roleId,
      isActive: user.isActive,
    });
  }, [user, reset]);

  function onSubmit(values: UpdateUserFormValues) {
    update.mutate(values, { onSuccess });
  }

  const isActive = watch("isActive");

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName?.message}>
          <input className={inputCls} {...register("firstName")} />
        </Field>
        <Field label="Last name" error={errors.lastName?.message}>
          <input className={inputCls} {...register("lastName")} />
        </Field>
      </div>

      <Field label="Phone (optional)" error={errors.phoneNumber?.message}>
        <input className={inputCls} {...register("phoneNumber")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" error={errors.roleId?.message}>
          <select className={inputCls} {...register("roleId")}>
            <option value="">Select role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <div className="flex items-center gap-3 h-10">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                isActive ? "bg-primary" : "bg-muted",
              )}
              onClick={() => setValue("isActive", !isActive)}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                  isActive ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
            <span className="text-sm text-muted-foreground">
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </Field>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending} size="sm">
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={update.isPending}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

// ─── shared helpers ────────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}
