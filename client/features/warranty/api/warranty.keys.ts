export const warrantyKeys = {
  all: ["warranty"] as const,
  vehicle: (vehicleId: string, mileage?: number) => [...warrantyKeys.all, "vehicle", vehicleId, mileage ?? null] as const,
  vehicles: () => [...warrantyKeys.all, "vehicle"] as const,
  models: (params?: Record<string, unknown>) => [...warrantyKeys.all, "models", params ?? {}] as const,
  codes: (includeInactive = false) => [...warrantyKeys.all, "codes", includeInactive] as const,
  parts: (search: string, applicableOnly: boolean) => [...warrantyKeys.all, "parts", search, applicableOnly] as const,
  summary: () => [...warrantyKeys.all, "summary"] as const,
  cases: () => [...warrantyKeys.all, "cases"] as const,
  caseList: (params: Record<string, unknown>) => [...warrantyKeys.cases(), "list", params] as const,
  case: (id: string) => [...warrantyKeys.cases(), "detail", id] as const,
};
