import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { jobCardKeys } from "../api/job-card.keys";

export type WorkflowAction =
  | "assignTechnician" | "reassignTechnician" | "submitInspection" | "bypassWarranty"
  | "prepareEstimate" | "requestParts" | "issueParts" | "startWork" | "finishWork"
  | "passQc" | "failQc" | "readyForBilling" | "bill";

export type InspectionPart = { sparePartId: string; quantity: number; name: string; partNumber: string };
export type JobCardWorkflow = {
  stage: string;
  version: number;
  faultVerification: string;
  inspectionRemarks: string | null;
  inspectionSubmittedAt: string | null;
  warrantySource: string | null;
  noPartsRequired: boolean;
  parts: (InspectionPart & { isUnderWarranty: boolean })[];
  history: { id: string; toStatus: string; actorId: string; actorName?: string; remarks: string | null; createdAt: string }[];
  actions: Partial<Record<WorkflowAction, { allowed: boolean; code?: string; reason?: string }>>;
};

type Mutation =
  | { action: "submitInspection"; remarks: string; noPartsRequired: boolean; parts: Pick<InspectionPart, "sparePartId" | "quantity">[] }
  | { action: "bypassWarranty" | "startWork" | "finishWork" | "readyForBilling" }
  | { action: "passQc" | "failQc"; remarks: string }
  | { action: "requestParts"; requestId: string }
  | { action: "assignTechnician"; technicianId: string };

const statuses = { startWork: "IN_PROGRESS", finishWork: "QC", readyForBilling: "READY" } as const;
const actionMessage: Record<Mutation["action"], string> = {
  assignTechnician: "Technician assignment saved",
  submitInspection: "Inspection submitted",
  bypassWarranty: "Job advanced without a warranty response",
  requestParts: "Parts request recorded",
  startWork: "Work started",
  finishWork: "Job sent for quality check",
  passQc: "Quality check passed",
  failQc: "Quality check failed and the job returned for rework",
  readyForBilling: "Job marked ready for billing",
};

export function useJobCardWorkflow(id: string) {
  const cache = useQueryClient();
  const detail = API_ROUTES.service.jobCards.detail(id);
  const endpoint = `${detail}/workflow/inspection`;
  const key = [...jobCardKeys.detail(id), "workflow"];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => (await apiGet<{ workflow: JobCardWorkflow | null }>(endpoint)).workflow,
    enabled: Boolean(id),
  });
  const mutation = useMutation({
    mutationFn: async (input: Mutation) => {
      const version = query.data?.version;
      if (version === undefined) throw new Error("Reload the job card before continuing");
      switch (input.action) {
        case "submitInspection":
        case "bypassWarranty":
          return apiPost(endpoint, { ...input, version });
        case "requestParts":
          return apiPost(API_ROUTES.service.jobCards.requestParts(id), { requestId: input.requestId, workflowVersion: version });
        case "assignTechnician":
          return apiPost(`/workshop/assign/${id}`, { technicianId: input.technicianId, workflowVersion: version });
        case "passQc":
        case "failQc":
          return apiPatch(`/workshop/qc/${id}`, { qcStatus: input.action === "passQc" ? "PASSED" : "FAILED", qcNotes: input.remarks, workflowVersion: version });
        default:
          return apiPatch(detail, { status: statuses[input.action], workflowVersion: version });
      }
    },
    onSuccess: async (_data, input) => {
      await cache.invalidateQueries({ queryKey: jobCardKeys.detail(id) });
      toast.success(actionMessage[input.action]);
    },
    onError: async (error) => {
      toast.error(apiErrorMessage(error, "Could not update the job card"));
      await cache.invalidateQueries({ queryKey: key });
    },
  });
  return { ...query, mutation };
}
