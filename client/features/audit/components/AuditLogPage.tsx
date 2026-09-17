"use client";

import { PageHeader } from "@/components/headers/page-header";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AuditLogTable } from "./AuditLogTable";
import { AuditStatsCards } from "./AuditStatsCards";

export function AuditLogPage() {
  const { user, isHydrated, isAdminOrAbove } = useAuth();
  const hasAuditPermission = user?.permissions?.includes("audit:read") ?? false;

  if (!isHydrated) return <div className="p-6"><div className="h-56 animate-pulse rounded-xl bg-muted" /></div>;
  if (!isAdminOrAbove && !hasAuditPermission) return <div className="p-6"><div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">You do not have permission to view the audit log.</div></div>;

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader title="Audit Log" description="Review a history of system actions and changes" />
      <AuditStatsCards />
      <AuditLogTable />
    </div>
  );
}
