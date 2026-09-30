import { StatusBadge } from "@/components/ui/table-components/StatusBadge";
import type { PartRole, PartStatus } from "../types/inventory.types";

export function PartStatusBadge({ status }: { status: PartStatus }) {
  return <StatusBadge status={status === "ACTIVE" ? "Active" : "Blocked"} tone={status === "ACTIVE" ? "emerald" : "red"} />;
}

export function PartRoleBadge({ role }: { role: PartRole }) {
  return <StatusBadge status={role === "MAIN" ? "Main" : "Alternate"} tone={role === "MAIN" ? "blue" : "purple"} />;
}

export function fmtNaira(n: number) {
  return `₦${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
