"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Mail, MapPin, Phone, PhoneOff, UserCog, UserRound } from "lucide-react";
import { toast } from "sonner";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCustomer } from "@/features/customers";
import { CustomerEditForm } from "@/features/customers/components/CustomerEditForm";
import { psfKeys } from "../api/psf.api";
import { telHref } from "../lib/psf.logic";
import type { PsfDetail } from "../types/psf.types";

/** Who to call: every phone (tap to dial), preferred follow-up day / time / method, address, and the profile editor. */
export function PsfCustomerCard({ detail }: { detail: PsfDetail }) {
  const { hasPermission, isSuperAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const customer = detail.customer;
  const canEdit = isSuperAdmin || hasPermission("customer:update");
  const preferences = customer
    ? [customer.preferredFollowupDay, customer.preferredFollowupTime, customer.preferredContactMethod].filter((value): value is string => Boolean(value?.trim()))
    : [];

  return (
    <aside aria-label="Customer" className="h-fit space-y-4 rounded-xl border border-slate-200 bg-white p-5 xl:sticky xl:top-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Customer</p>
          {customer ? (
            <Link href={`/customers/${customer.id}`} className="block truncate font-semibold text-slate-900 underline-offset-4 hover:underline">{customer.name}</Link>
          ) : (
            <p className="font-semibold text-slate-500">No customer on this job</p>
          )}
          {customer?.contactPerson && <p className="truncate text-xs text-slate-500">Contact: {customer.contactPerson}</p>}
        </div>
      </div>

      {customer && (
        <>
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Phone numbers</p>
            {customer.phones.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><PhoneOff className="size-4 text-slate-400" /> No phone on record: record “No phone” (3) or update the profile.</p>
            ) : (
              <ul className="space-y-1.5">
                {customer.phones.map((phone) => (
                  <li key={phone.number} className="flex items-center gap-2">
                    <a href={telHref(phone.number)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-primary hover:bg-primary/5">
                      <Phone className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block font-mono text-sm font-semibold text-slate-900">{phone.number}</span>
                        <span className="block text-[11px] text-slate-500">{phone.label}</span>
                      </span>
                    </a>
                    <button
                      type="button"
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`Copy ${phone.number}`}
                      onClick={() => void navigator.clipboard?.writeText(phone.number).then(() => toast.success("Number copied"))}
                    >
                      <Copy className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {preferences.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Prefers to be called</p>
              <div className="flex flex-wrap gap-1.5">
                {preferences.map((value) => (
                  <span key={value} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200"><CalendarDays className="size-3" />{value}</span>
                ))}
              </div>
            </div>
          )}

          <dl className="space-y-2 text-sm">
            <div className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" /><dd className="text-slate-700">{customer.address ?? <span className="text-slate-400">No address</span>}</dd></div>
            {customer.email && <div className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0 text-slate-400" /><dd className="truncate text-slate-700">{customer.email}</dd></div>}
          </dl>

          {canEdit && (
            <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
              <UserCog className="size-4" /> Update customer profile
            </Button>
          )}
          <ModalFame isOpen={editing} onClose={() => setEditing(false)} title={`Update ${customer.name}`}>
            {editing && <ProfileEditor customerId={customer.id} jobId={detail.id} onDone={() => setEditing(false)} />}
          </ModalFame>
        </>
      )}
    </aside>
  );
}

function ProfileEditor({ customerId, jobId, onDone }: { customerId: string; jobId: string; onDone: () => void }) {
  const client = useQueryClient();
  const customer = useCustomer(customerId);
  if (customer.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>;
  if (!customer.data) return <p className="text-sm text-red-600">Could not load the customer.</p>;
  return (
    <CustomerEditForm
      customer={customer.data}
      onSuccess={() => {
        // The call screen shows the corrected phone numbers straight away.
        void client.invalidateQueries({ queryKey: psfKeys.detail(jobId) });
        void client.invalidateQueries({ queryKey: psfKeys.all });
        onDone();
      }}
    />
  );
}
