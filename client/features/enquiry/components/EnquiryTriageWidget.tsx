"use client";

import Link from "next/link";
import { useEnquiries } from "../hooks/use-enquires";
import { useBranchStore } from "@/store/branch.store";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ENQUIRY_READ_ROLES } from "@/features/auth/roles";
import { formatDistanceToNow } from "date-fns";

export default function EnquiryTriageWidget() {
  const { activeBranch } = useBranchStore();
  const { hasAccess } = useAuth();
  const canSee = hasAccess(ENQUIRY_READ_ROLES);

  const { data, isLoading } = useEnquiries({
    limit: 5,
    status: "open",
    branchId: activeBranch?.id,
  });

  if (!canSee) return null;

  return (
    <div className="rounded-lg bg-[#071225] p-4 text-white">
      <h3 className="mb-3 text-sm font-semibold">Triage Queue</h3>
      {isLoading ? (
        <div>Loading…</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {(data?.enquiries ?? []).map((e: any) => (
            <li key={e.id}>
              <Link
                href={`/enquiries/${e.id}`}
                className="flex justify-between rounded-md p-2 hover:bg-white/5"
              >
                <div className="truncate">
                  <div className="text-sm font-medium truncate">{e.title ?? e.subject ?? `Enquiry #${e.id}`}</div>
                  <div className="text-xs text-white/60 truncate">{e.customerName ?? e.customer?.name}</div>
                </div>
                <div className="ml-4 text-xs text-white/60">
                  {e.createdAt ? formatDistanceToNow(new Date(e.createdAt), { addSuffix: true }) : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 text-right">
        <Link href="/enquiries" className="text-sm text-primary">View more</Link>
      </div>
    </div>
  );
}
