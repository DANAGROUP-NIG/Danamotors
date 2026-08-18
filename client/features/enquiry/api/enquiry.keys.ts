type EnquiryListParams = {
  page?:     number;
  limit?:    number;
  branchId?: string;
  status?:   string;
  search?:   string;
  dateFrom?: string;
  dateTo?:   string;
};

export const enquiryKeys = {
  all:     ['enquiries']                           as const,
  lists:   () => [...enquiryKeys.all, 'list']      as const,
  list:    (p: EnquiryListParams) => [...enquiryKeys.lists(), p] as const,
  details: () => [...enquiryKeys.all, 'detail']    as const,
  detail:  (id: string) => [...enquiryKeys.details(), id] as const,
};