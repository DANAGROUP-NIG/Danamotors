"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/apiClient";
import type { Employee } from "../types/employee.types";

/** One employee. The key starts with "employees", so saving an employee refreshes it too. */
export function useEmployee(id: string) {
  return useQuery({
    queryKey: ["employees", "detail", id],
    queryFn: () => apiGet<{ item: Employee }>(`/employees/${id}`),
    enabled: !!id,
  });
}
