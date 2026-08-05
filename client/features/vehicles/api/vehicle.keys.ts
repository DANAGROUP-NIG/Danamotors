export const vehicleKeys = {
  all: ["vehicles"] as const,
  lists: () => [...vehicleKeys.all, "list"] as const,
  list: (params?: Record<string, unknown>) =>
    [...vehicleKeys.lists(), params] as const,
  byCustomer: (customerId: string) =>
    [...vehicleKeys.all, "byCustomer", customerId] as const,
  details: () => [...vehicleKeys.all, "detail"] as const,
  detail: (id: string) => [...vehicleKeys.details(), id] as const,
};
