import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "@/features/warranty/lib/warranty-format";
import { jobCardKeys } from "../api/job-card.keys";
import { setCampaignAttendanceRequest, type CampaignAttendancePayload } from "../api/job-card-campaigns.api";

/** Records whether a linked campaign's (FPC) work was done on the job. */
export function useSetCampaignAttendance(jobCardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campaignId, body }: { campaignId: string; body: CampaignAttendancePayload }) => setCampaignAttendanceRequest(jobCardId, campaignId, body),
    onSuccess: (_data, { body }) => {
      qc.invalidateQueries({ queryKey: jobCardKeys.detail(jobCardId) });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(body.attended ? "Campaign work recorded as done" : "Campaign work recorded as not done");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not record the campaign work")),
  });
}
