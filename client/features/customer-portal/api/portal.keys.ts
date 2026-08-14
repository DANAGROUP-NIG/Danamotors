export const portalKeys = {
  all: ["portal"] as const,
  profile: ["portal", "profile"] as const,
  dashboard: ["portal", "dashboard"] as const,
  vehicles: ["portal", "vehicles"] as const,
  vehicle: (id: string) => ["portal", "vehicles", id] as const,
  jobCards: (filters?: Record<string, unknown>) =>
    ["portal", "job-cards", filters ?? {}] as const,
  jobCard: (id: string) => ["portal", "job-cards", id] as const,
  appointments: ["portal", "appointments"] as const,
  services: ["portal", "services"] as const,
  invoices: ["portal", "invoices"] as const,
  invoice: (id: string) => ["portal", "invoices", id] as const,
  credit: ["portal", "credit"] as const,
  creditApplications: ["portal", "credit", "applications"] as const,
};
