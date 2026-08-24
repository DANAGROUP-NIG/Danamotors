import { useQuery } from '@tanstack/react-query';
import { getEnquiriesRequest } from '../api/enquiry.api';
import { enquiryKeys } from '../api/enquiry.keys';

export function useEnquiries(params?: {
  page?:     number;
  limit?:    number;
  branchId?: string;
  status?:   string;
  search?:   string;
  dateFrom?: string;
  dateTo?:   string;
}) {
  return useQuery({
    queryKey: enquiryKeys.list(params ?? {}),
    queryFn:  () => getEnquiriesRequest(params),
  });
}