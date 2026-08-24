import { useQuery } from '@tanstack/react-query';
import { getEnquiryRequest } from '../api/enquiry.api';
import { enquiryKeys } from '../api/enquiry.keys';

export function useEnquiry(id?: string) {
  return useQuery({
    queryKey: enquiryKeys.detail(id ?? ''),
    queryFn: () => getEnquiryRequest(id ?? ''),
    enabled: Boolean(id),
  });
}

export default useEnquiry;
