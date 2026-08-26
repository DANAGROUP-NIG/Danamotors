import { useQuery } from "@tanstack/react-query";
import { enquiryKeys } from "../api/enquiry.keys";
import { getEnquiryPrefillRequest } from "../api/enquiry.api";
import type { EnquiryPrefillData } from "../types/enquiry.types";

export function useEnquiryPrefill(enquiryId: string | null) {
  return useQuery({
    queryKey: enquiryKeys.prefill(enquiryId || ""),
    queryFn: () => {
      if (!enquiryId) throw new Error("Enquiry ID is required");
      return getEnquiryPrefillRequest(enquiryId);
    },
    enabled: !!enquiryId,
    staleTime: 5 * 60 * 1000,
  });
}

export type { EnquiryPrefillData };