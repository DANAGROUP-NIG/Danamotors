"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/features/users";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useUser(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const user = data?.user;

  if (error || !user) {
    return (
      <div className="px-4 py-10 lg:px-6">
        <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="size-4" /> Back to Users
        </Link>
        <p className="text-sm text-red-500">User not found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-6">
      <Link href="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="size-4" /> Back to Users
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-center gap-4">
          <span className="inline-grid size-12 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{user.firstName} {user.lastName}</h1>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Phone" value={user.phoneNumber} />
          <DetailField label="Role" value={user.role?.name} />
          <DetailField label="Branch" value={user.branch?.name} />
          <DetailField label="Status" value={user.isActive ? "Active" : "Inactive"} />
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value || "—"}</p>
    </div>
  );
}
