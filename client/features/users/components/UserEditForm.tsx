"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { cn } from "@/lib/utils";
import { useUpdateUser } from "../hooks/use-update-user";
import { useRoles } from "../hooks/use-roles";
import { CopyAccessSelect } from "./copy-access-select";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "@/features/branches/hooks/use-branches";
import {
  updateUserSchema,
  type UpdateUserFormValues,
} from "../schemas/user.schema";
import type { User } from "../types/user.types";

interface UserEditFormProps {
  user: User;
  onSuccess?: () => void;
}

export function UserEditForm({ user, onSuccess }: UserEditFormProps) {
  const update = useUpdateUser(user.id);
  const { data: rolesData } = useRoles();
  const roles = rolesData?.roles ?? [];
  // Only a super admin may move a user to another branch (the server enforces it too).
  const { isSuperAdmin } = useAuth();
  const { data: branchesData } = useBranches({ page: 1, limit: 100 });
  const branches = (branchesData?.branches ?? []).filter((b) => b.isActive || b.id === user.branchId);

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
      branchId: user.branchId ?? "",
      isActive: user.isActive,
      copyFromUserId: "",
    },
  });

  useEffect(() => {
    reset({
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber ?? "",
      roleId: user.roleId,
      branchId: user.branchId ?? "",
      isActive: user.isActive,
      copyFromUserId: "",
    });
  }, [user, reset]);

  const copyFrom = watch("copyFromUserId") ?? "";

  function onSubmit(values: UpdateUserFormValues) {
    // Send the branch only when a super admin actually changed it. Copying replaces the role, so the
    // role field is not sent with it.
    const { branchId, copyFromUserId, roleId, ...rest } = values;
    const access = copyFromUserId
      ? { copyFromUserId }
      : { roleId };
    if (copyFromUserId && !window.confirm("Replace this user's role and own permissions with the chosen user's?")) return;
    const payload = isSuperAdmin && branchId && branchId !== user.branchId ? { ...rest, ...access, branchId } : { ...rest, ...access };
    update.mutate(payload, { onSuccess });
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

      {isSuperAdmin && (
        <Field label="Branch" error={errors.branchId?.message}>
          <select className={inputCls} {...register("branchId")}>
            {!user.branchId && <option value="">No branch</option>}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" error={errors.roleId?.message}>
          <select className={inputCls} disabled={!!copyFrom} {...register("roleId")}>
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

      <Field label="Copy access from user (optional)">
        <CopyAccessSelect
          value={copyFrom}
          excludeId={user.id}
          onChange={(id) => setValue("copyFromUserId", id)}
        />
        {copyFrom && (
          <p className="mt-1 text-sm text-muted-foreground">
            Replaces the role and any permissions granted or denied to this user with the chosen user&apos;s.
          </p>
        )}
      </Field>

      <Button type="submit" disabled={update.isPending} size="sm">
        {update.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
