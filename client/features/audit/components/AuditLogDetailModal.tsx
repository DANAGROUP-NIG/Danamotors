"use client";

import Link from "next/link";
import ModalFame from "@/components/modals/ModalFame";
import { Button } from "@/components/ui/button";
import { useAuditLog } from "../hooks/use-audit-logs";

export function AuditLogDetailModal({ logId, onClose }: { logId: string | null; onClose: () => void }) {
  const { data: log, isLoading, isError } = useAuditLog(logId);
  return (
    <ModalFame isOpen={!!logId} onClose={onClose} title="Audit log details">
      {isLoading && <div className="h-52 animate-pulse rounded-xl bg-muted" />}
      {isError && <p className="text-sm text-red-600">Unable to load this audit log entry.</p>}
      {log && (
        <div className="space-y-5 text-sm">
          <Detail label="Timestamp" value={new Date(log.createdAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" })} />
          <Detail label="Action" value={log.action.replaceAll("_", " ")} />
          <Detail label="User" value={log.user ? `${log.user.firstName} ${log.user.lastName} (${log.user.email})` : "System"} />
          <Detail label="Details" value={log.details || "No details recorded"} preWrap />
          <Detail label="IP address" value={log.ipAddress || "Not recorded"} mono />
          <Detail label="User agent" value={log.userAgent || "Not recorded"} preWrap />
          {(log.userId || log.user?.id) && (
            <Button asChild variant="outline" size="sm"><Link href={`/users/${log.userId ?? log.user?.id}`}>View User Profile</Link></Button>
          )}
        </div>
      )}
    </ModalFame>
  );
}

function Detail({ label, value, mono, preWrap }: { label: string; value: string; mono?: boolean; preWrap?: boolean }) {
  return <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`${mono ? "font-mono" : ""} ${preWrap ? "whitespace-pre-wrap break-words" : ""}`}>{value}</p></div>;
}
