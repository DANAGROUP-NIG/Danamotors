"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/headers/page-header";
import {
  portalPasswordSchema,
  portalProfileSchema,
  type PortalPasswordFormValues,
  type PortalProfileFormValues,
} from "@/features/customer-portal/schemas/portal.schema";
import {
  useChangePortalPassword,
  useUpdatePortalProfile,
} from "@/features/customer-portal/hooks/use-portal-mutations";
import { usePortalProfile } from "@/features/customer-portal/hooks/use-portal";

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">
        {label}{" "}
        {optional && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </span>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-md border border-border bg-background px-3 outline-none focus:ring-2 focus:ring-ring";

export default function PortalProfilePage() {
  const { data: profile, isLoading } = usePortalProfile();
  const updateProfile = useUpdatePortalProfile();
  const changePassword = useChangePortalPassword();

  const profileForm = useForm<PortalProfileFormValues>({
    resolver: zodResolver(portalProfileSchema),
  });
  const passwordForm = useForm<PortalPasswordFormValues>({
    resolver: zodResolver(portalPasswordSchema),
  });

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        phoneNumber: profile.phoneNumber ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        state: profile.state ?? "",
        postalCode: profile.postalCode ?? "",
        country: profile.country ?? "",
        preferredContactMethod: profile.preferredContactMethod ?? "",
      });
    }
  }, [profile, profileForm]);

  function onSaveProfile(values: PortalProfileFormValues) {
    updateProfile.mutate({
      firstName: values.firstName,
      lastName: values.lastName,
      phoneNumber: values.phoneNumber || undefined,
      address: values.address || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      postalCode: values.postalCode || undefined,
      country: values.country || undefined,
      preferredContactMethod: values.preferredContactMethod || undefined,
    });
  }

  function onSavePassword(values: PortalPasswordFormValues) {
    changePassword.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Profile"
        description="Update your contact details and password"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form
                className="grid gap-4"
                onSubmit={profileForm.handleSubmit(onSaveProfile)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="First name"
                    error={profileForm.formState.errors.firstName?.message}
                  >
                    <input
                      className={inputClass}
                      {...profileForm.register("firstName")}
                    />
                  </Field>
                  <Field
                    label="Last name"
                    error={profileForm.formState.errors.lastName?.message}
                  >
                    <input
                      className={inputClass}
                      {...profileForm.register("lastName")}
                    />
                  </Field>
                </div>

                <Field
                  label="Email"
                  optional
                >
                  <input className={inputClass} value={profile?.email ?? ""} disabled />
                </Field>

                <Field
                  label="Phone number"
                  optional
                  error={profileForm.formState.errors.phoneNumber?.message}
                >
                  <input
                    type="tel"
                    className={inputClass}
                    {...profileForm.register("phoneNumber")}
                  />
                </Field>

                <Field
                  label="Address"
                  optional
                >
                  <input
                    className={inputClass}
                    {...profileForm.register("address")}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" optional>
                    <input className={inputClass} {...profileForm.register("city")} />
                  </Field>
                  <Field label="State" optional>
                    <input className={inputClass} {...profileForm.register("state")} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Postal code" optional>
                    <input
                      className={inputClass}
                      {...profileForm.register("postalCode")}
                    />
                  </Field>
                  <Field label="Country" optional>
                    <input className={inputClass} {...profileForm.register("country")} />
                  </Field>
                </div>

                <Field label="Preferred contact method" optional>
                  <select
                    className={inputClass}
                    {...profileForm.register("preferredContactMethod")}
                  >
                    <option value="">None selected</option>
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="SMS">SMS</option>
                  </select>
                </Field>

                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? "Saving…" : "Save changes"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={passwordForm.handleSubmit(onSavePassword)}
            >
              <Field
                label="Current password"
                error={passwordForm.formState.errors.currentPassword?.message}
              >
                <input
                  type="password"
                  className={inputClass}
                  {...passwordForm.register("currentPassword")}
                />
              </Field>

              <Field
                label="New password"
                error={passwordForm.formState.errors.newPassword?.message}
              >
                <input
                  type="password"
                  className={inputClass}
                  {...passwordForm.register("newPassword")}
                />
              </Field>

              <Field
                label="Confirm new password"
                error={passwordForm.formState.errors.confirmPassword?.message}
              >
                <input
                  type="password"
                  className={inputClass}
                  {...passwordForm.register("confirmPassword")}
                />
              </Field>

              <p className="text-xs text-muted-foreground">
                After changing your password you will be signed out and asked to
                sign in again.
              </p>

              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Updating…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
