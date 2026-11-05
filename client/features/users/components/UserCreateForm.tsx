"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateUser } from "../hooks/use-create-user";
import { useRoles } from "../hooks/use-roles";
import { CopyAccessSelect } from "./copy-access-select";
import {
  createUserSchema,
  type CreateUserFormValues,
} from "../schemas/user.schema";

interface UserCreateFormProps {
  onSuccess?: () => void;
}

export function UserCreateForm({ onSuccess }: UserCreateFormProps) {
  const create = useCreateUser();
  const { data: rolesData } = useRoles();
  const roles = rolesData?.roles ?? [];
  const activeBranch = useBranchStore((s) => s.activeBranch);
  const branches = useBranchStore((s) => s.branches);
  const { isSuperAdmin } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
  });

  const copyFrom = watch("copyFromUserId") ?? "";

  function onSubmit(values: CreateUserFormValues) {
    // Copying takes the source user's role, so the role field is not sent.
    const payload = values.copyFromUserId ? { ...values, roleId: undefined } : { ...values, copyFromUserId: undefined };
    create.mutate(payload, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName?.message}>
          <input
            className={inputCls}
            placeholder="Jane"
            {...register("firstName")}
          />
        </Field>
        <Field label="Last name" error={errors.lastName?.message}>
          <input
            className={inputCls}
            placeholder="Doe"
            {...register("lastName")}
          />
        </Field>
      </div>

      <Field label="Email" error={errors.email?.message}>
        <input
          type="email"
          className={inputCls}
          placeholder="jane@example.com"
          {...register("email")}
        />
      </Field>

      <Field label="Password" error={errors.password?.message}>
        <input
          type="password"
          className={inputCls}
          placeholder="Min 6 characters"
          {...register("password")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone (optional)" error={errors.phoneNumber?.message}>
          <input
            className={inputCls}
            placeholder="+234 800 000 0000"
            {...register("phoneNumber")}
          />
        </Field>
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
      </div>

      <Field label="Copy access from user (optional)">
        <CopyAccessSelect
          value={copyFrom}
          onChange={(id) => setValue("copyFromUserId", id, { shouldValidate: true })}
        />
        {copyFrom && (
          <p className="mt-1 text-sm text-muted-foreground">
            The new user gets this user&apos;s role and any permissions granted or denied to them.
          </p>
        )}
      </Field>

      {isSuperAdmin ? (
        <Field label="Branch" error={errors.branchName?.message}>
          <select className={inputCls} {...register("branchName")}>
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      ) : activeBranch ? (
        <Field label="Branch">
          <input
            className={inputCls}
            value={activeBranch.name}
            readOnly
          />
        </Field>
      ) : null}

      <Button type="submit" disabled={create.isPending} className="mt-1">
        {create.isPending ? "Adding…" : "Add user"}
      </Button>
    </form>
  );
}
