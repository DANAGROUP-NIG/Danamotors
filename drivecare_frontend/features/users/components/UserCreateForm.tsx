"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCreateUser } from "../hooks/use-create-user";
import { useRoles } from "../hooks/use-roles";
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
  const { isSuperAdmin } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      branchName: isSuperAdmin ? "" : (activeBranch?.name ?? ""),
    },
  });

  function onSubmit(values: CreateUserFormValues) {
    create.mutate(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add user</CardTitle>
      </CardHeader>
      <CardContent>
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
              <select className={inputCls} {...register("roleId")}>
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Branch" error={errors.branchName?.message}>
            <input
              className={inputCls}
              placeholder="e.g. Ikeja Branch"
              readOnly={!isSuperAdmin}
              {...register("branchName")}
            />
          </Field>

          <Button type="submit" disabled={create.isPending} className="mt-1">
            {create.isPending ? "Adding…" : "Add user"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
