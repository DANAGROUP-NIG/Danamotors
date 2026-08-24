"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/headers/page-header";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranches } from "@/features/branches/hooks/use-branches";
import { useUpdateProfile } from "../hooks/use-update-profile";
import {
  personalInfoSchema,
  passwordChangeSchema,
  type PersonalInfoFormValues,
  type PasswordChangeFormValues,
} from "../schemas/profile.schema";
import type { UpdateProfilePayload } from "@/features/auth/types/auth.types";

function formatRoleName(role: string): string {
  return role.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function cardCls() {
  return "rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm";
}

export function ProfilePage() {
  const { user } = useAuth();
  const { data: branchesData } = useBranches({ limit: 100 });
  const update = useUpdateProfile();

  const branchName = branchesData?.branches.find(
    (b) => b.id === user?.branchId,
  )?.name;

  const personal = useForm<PersonalInfoFormValues>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      phoneNumber: user?.phoneNumber ?? "",
    },
  });

  useEffect(() => {
    if (user) {
      personal.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, user?.firstName, user?.lastName, user?.phoneNumber]);

  function onSavePersonal(values: PersonalInfoFormValues) {
    const payload: UpdateProfilePayload = {
      firstName: values.firstName,
      lastName: values.lastName,
      phoneNumber: values.phoneNumber || undefined,
    };
    update.mutate(payload);
  }

  const password = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  function onChangePassword(values: PasswordChangeFormValues) {
    update.mutate(
      {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      },
      {
        onSuccess: () => {
          password.reset();
        },
      },
    );
  }

  const initials = `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="My Profile"
        description="View and update your account information."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── Identity card ─────────────────────────────────────────── */}
        <div className={`${cardCls()} flex h-fit flex-col items-center gap-3 text-center`}>
          <span className="inline-grid size-16 place-items-center rounded-full bg-primary text-xl font-bold text-white">
            {initials || "?"}
          </span>
          <div>
            <p className="text-lg font-bold text-foreground">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="w-full space-y-2 border-t border-[#eef2f7] pt-4 text-left text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              {user?.role ? formatRoleName(user.role) : "—"}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="size-4 shrink-0 text-primary" />
              {branchName ?? "No branch assigned"}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Mail className="size-4 shrink-0 text-primary" />
              {user?.phoneNumber || "No phone number"}
            </p>
          </div>
        </div>

        {/* ── Forms ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 lg:col-span-2">
          {/* Personal information */}
          <div className={cardCls()}>
            <p className="font-semibold text-foreground">Personal information</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Update your name and contact details. Your email cannot be changed.
            </p>

            <form
              className="mt-4 grid gap-4"
              onSubmit={personal.handleSubmit(onSavePersonal)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" error={personal.formState.errors.firstName?.message}>
                  <input className={inputCls} {...personal.register("firstName")} />
                </Field>
                <Field label="Last name" error={personal.formState.errors.lastName?.message}>
                  <input className={inputCls} {...personal.register("lastName")} />
                </Field>
              </div>
              <Field label="Phone number (optional)" error={personal.formState.errors.phoneNumber?.message}>
                <input className={inputCls} {...personal.register("phoneNumber")} />
              </Field>
              <div>
                <Button type="submit" size="sm" disabled={update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </div>

          {/* Change password */}
          <div className={cardCls()}>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <p className="font-semibold text-foreground">Change password</p>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Use a strong password you do not use anywhere else.
            </p>

            <form
              className="mt-4 grid gap-4"
              onSubmit={password.handleSubmit(onChangePassword)}
            >
              <Field
                label="Current password"
                error={password.formState.errors.currentPassword?.message}
              >
                <input
                  type="password"
                  className={inputCls}
                  autoComplete="current-password"
                  {...password.register("currentPassword")}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="New password"
                  error={password.formState.errors.newPassword?.message}
                >
                  <input
                    type="password"
                    className={inputCls}
                    autoComplete="new-password"
                    {...password.register("newPassword")}
                  />
                </Field>
                <Field
                  label="Confirm new password"
                  error={password.formState.errors.confirmPassword?.message}
                >
                  <input
                    type="password"
                    className={inputCls}
                    autoComplete="new-password"
                    {...password.register("confirmPassword")}
                  />
                </Field>
              </div>
              <div>
                <Button type="submit" size="sm" disabled={update.isPending}>
                  {update.isPending ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
