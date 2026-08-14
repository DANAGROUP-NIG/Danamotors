export const creditKeys = {
  all: ["credit"] as const,
  customer: (customerId: string) => ["credit", "customers", customerId] as const,
  applications: (filters?: Record<string, unknown>) =>
    ["credit", "applications", filters ?? {}] as const,
};
