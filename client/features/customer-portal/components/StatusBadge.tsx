import { Badge } from "@/components/ui/badge";

function statusTone(status?: string): "blue" | "green" | "amber" | "neutral" {
  const s = status?.toLowerCase() ?? "";
  if (["completed", "closed", "approved", "paid", "checked-in"].includes(s)) {
    return "green";
  }
  if (["open", "in progress", "confirmed", "partially paid"].includes(s)) {
    return "blue";
  }
  if (["pending", "rejected", "unpaid", "cancelled", "overdue"].includes(s)) {
    return "amber";
  }
  return "neutral";
}

export function StatusBadge({ status }: { status?: string }) {
  if (!status) return <Badge tone="neutral">—</Badge>;
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
