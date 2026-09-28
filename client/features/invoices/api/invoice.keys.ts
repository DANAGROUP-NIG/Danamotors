export const invoiceKeys = {
  all: ["invoices"] as const,
  lists: () => [...invoiceKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) =>
    [...invoiceKeys.lists(), params] as const,
  details: () => [...invoiceKeys.all, "detail"] as const,
  detail: (id: string) => [...invoiceKeys.details(), id] as const,
  billableJobCards: () => [...invoiceKeys.all, "billable-job-cards"] as const,
  jobBillPreview: (jobCardId?: string, partsDiscount?: number, labourDiscount?: number) =>
    [...invoiceKeys.all, "job-bill-preview", jobCardId, partsDiscount, labourDiscount] as const,
};
