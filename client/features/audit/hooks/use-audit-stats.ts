import { useQuery } from "@tanstack/react-query";
import { getAuditStats } from "../api/audit.api";
import { auditKeys } from "./use-audit-logs";

export function useAuditStats() {
  return useQuery({ queryKey: auditKeys.stats(), queryFn: getAuditStats });
}
