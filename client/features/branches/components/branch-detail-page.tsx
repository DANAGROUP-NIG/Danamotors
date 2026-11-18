"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import ModalFame from "@/components/modals/ModalFame";
import { copyToClipboard } from "@/lib/table-actions";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useBranch } from "../hooks/use-branch";
import { BranchEditForm } from "./BranchEditForm";

export function DetailField({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 break-words text-sm text-foreground">{value || value === 0 ? value : "—"}</div>
    </div>
  );
}

export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString() : undefined;

export function BranchDetailPage({ id }: { id: string }) {
  const { data, isLoading, isError } = useBranch(id);
  const { hasPermission } = useAuth();
  const [editing, setEditing] = useState(false);
  const branch = data?.branch;

  const back = (
    <Link href="/branches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back to Branches
    </Link>
  );

  if (isLoading) return <LoadingSkeleton variant="detail" />;

  if (isError || !branch) {
    return (
      <div className="grid gap-4 p-4 lg:p-6">
        {back}
        <p className="text-sm text-red-500">Branch not found.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-4 lg:p-6">
      {back}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground">{branch.name}</h1>
            {branch.code && <span className="font-mono text-sm text-muted-foreground">{branch.code}</span>}
            <StatusBadge status={branch.isActive ? "Active" : "Inactive"} tone={branch.isActive ? "emerald" : "gray"} />
          </div>
          {branch.parentBranch && (
            <p className="mt-1 text-sm text-muted-foreground">
              Sub-location of{" "}
              <Link href={`/branches/${branch.parentBranch.id}`} className="text-primary hover:underline">{branch.parentBranch.name}</Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => copyToClipboard(window.location.href, "Branch link copied")}>
            <Link2 className="size-4" /> Copy link
          </Button>
          {hasPermission("branch:update") && (
            <Button size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Users" value={branch.usersCount ?? 0} />
        <Stat label="Job cards" value={branch.jobCardsCount ?? 0} />
        <Stat label="Appointments" value={branch.appointmentsCount ?? 0} />
      </div>

      <DetailCard title="Contact">
        <DetailField label="Phone" value={branch.phoneNumber} />
        <DetailField label="Email" value={branch.email} />
        <DetailField label="Address" value={branch.address} />
        <DetailField label="City" value={branch.city} />
        <DetailField label="State" value={branch.state} />
        <DetailField label="Country" value={branch.country} />
      </DetailCard>

      <DetailCard title="Store location">
        <DetailField label="Code" value={branch.code} />
        <DetailField label="Short name" value={branch.shortName} />
        <DetailField
          label="Sub-locations"
          value={branch.subLocations?.length ? (
            <ul className="grid gap-1">
              {branch.subLocations.map(sub => (
                <li key={sub.id}>
                  <Link href={`/branches/${sub.id}`} className="text-primary hover:underline">{sub.name}</Link>
                  {sub.code && <span className="ml-1.5 font-mono text-muted-foreground">{sub.code}</span>}
                </li>
              ))}
            </ul>
          ) : undefined} />
      </DetailCard>

      <DetailCard title="Record">
        <DetailField label="Created" value={date(branch.createdAt)} />
        <DetailField label="Last updated" value={date(branch.updatedAt)} />
      </DetailCard>

      <ModalFame isOpen={editing} onClose={() => setEditing(false)} title={`Edit ${branch.name}`}>
        <BranchEditForm branch={branch} onSuccess={() => setEditing(false)} />
      </ModalFame>
    </div>
  );
}
