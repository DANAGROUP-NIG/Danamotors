import { apiPut } from "@/lib/api/apiClient";

/** Why campaign (FPC) work was not done on a job. Mirrors NOT_ATTENDED_REASONS on the server. */
export const NOT_ATTENDED_REASONS = {
  PARTS_NOT_AVAILABLE: "Parts not available",
  CUSTOMER_DECLINED: "Customer declined",
  DONE_ELSEWHERE: "Done elsewhere",
  NOT_APPLICABLE: "Not applicable to this vehicle",
  NO_TIME: "No time on this visit",
  OTHER: "Other",
} as const;
export type NotAttendedReason = keyof typeof NOT_ATTENDED_REASONS;

export type CampaignAttendancePayload = { attended: boolean; reason?: NotAttendedReason | null; note?: string | null };

export const setCampaignAttendanceRequest = (jobCardId: string, campaignId: string, body: CampaignAttendancePayload) =>
  apiPut<unknown>(`/service/job-cards/${jobCardId}/campaigns/${campaignId}/attendance`, body);
