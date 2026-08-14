"use client";

import { useState } from "react";
import { Wallet, Plus, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth.store";
import {
  useAdjustCustomerCredit,
  useCustomerCredit,
} from "@/features/credit/hooks/use-credit";
import type { Customer } from "../types/customer.types";

export function CustomerCreditCard({ customer }: { customer: Customer }) {
  const { data, isLoading } = useCustomerCredit(customer.id);
  const adjust = useAdjustCustomerCredit(customer.id);
  const canAdjust = useAuthStore(
    (s) =>
      !!s.user &&
      (s.user.permissions.includes("finance:create") ||
        s.user.permissions.includes("finance:update")),
  );

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) return;
    adjust.mutate(
      { amount: value, description: description || undefined },
      {
        onSuccess: () => {
          setAmount("");
          setDescription("");
        },
      },
    );
  }

  const balance = data?.customer.creditBalance ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Wallet className="size-4" />
          Customer credit
        </div>
        <span className="text-lg font-bold text-primary">
          ₦{balance.toLocaleString("en-NG")}
        </span>
      </div>

      {canAdjust && (
        <form
          onSubmit={onSubmit}
          className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-end"
        >
          <label className="grid flex-1 gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Amount (₦) — positive adds, negative deducts
            </span>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10000"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <label className="grid flex-1 gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Description
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Refund, goodwill credit"
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <Button
            type="submit"
            disabled={
              adjust.isPending ||
              !Number.isFinite(Number(amount)) ||
              Number(amount) === 0
            }
            className="gap-2"
          >
            {adjust.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : Number(amount) > 0 ? (
              <Plus className="size-4" />
            ) : (
              <Minus className="size-4" />
            )}
            Update
          </Button>
        </form>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          Ledger
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-slate-300" />
          </div>
        ) : !data || data.transactions.length === 0 ? (
          <p className="py-3 text-sm text-slate-400">No credit transactions.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-slate-500">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          tx.amount < 0
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {tx.type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-2 pr-4 text-slate-600">
                      {tx.description ?? "—"}
                    </td>
                    <td
                      className={`py-2 pr-4 font-medium ${
                        tx.amount < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {tx.amount < 0 ? "−" : "+"}₦
                      {Math.abs(tx.amount).toLocaleString("en-NG")}
                    </td>
                    <td className="py-2 pr-4 text-slate-700">
                      ₦{tx.balanceAfter.toLocaleString("en-NG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
