"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManageCustomerAccount } from "../hooks/use-manage-customer-account";
import type { Customer } from "../types/customer.types";

export function CustomerPortalAccessCard({ customer }: { customer: Customer }) {
  const [password, setPassword] = useState("");
  const manage = useManageCustomerAccount(customer.id);

  const hasAccount = !!customer.account;

  function onSave() {
    if (!password.trim()) return;
    manage.mutate(
      { password, isExisting: hasAccount },
      { onSuccess: () => setPassword("") },
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <ShieldCheck className="size-4" />
        Customer portal access
      </div>

      {hasAccount && customer.account && (
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Status
            </dt>
            <dd className="mt-0.5">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  customer.account.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {customer.account.isActive ? "Active" : "Disabled"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Created
            </dt>
            <dd className="mt-0.5 text-slate-700">
              {new Date(customer.account.createdAt).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Last login
            </dt>
            <dd className="mt-0.5 text-slate-700">
              {customer.account.lastLoginAt
                ? new Date(customer.account.lastLoginAt).toLocaleString()
                : "Never"}
            </dd>
          </div>
        </dl>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5">
          <span className="text-sm font-medium text-slate-700">
            {hasAccount ? "Reset password" : "Set a password"} — sent to the
            customer separately
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 6 characters)"
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </label>
        <Button
          onClick={onSave}
          disabled={password.trim().length < 6 || manage.isPending}
          className="gap-2"
        >
          <KeyRound className="size-4" />
          {manage.isPending
            ? "Saving…"
            : hasAccount
              ? "Reset password"
              : "Create login"}
        </Button>
      </div>
    </div>
  );
}
