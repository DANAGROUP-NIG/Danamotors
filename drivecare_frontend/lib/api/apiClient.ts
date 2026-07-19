import { api } from "./axios";

export type ApiSuccessResponse<T> = {
  status: "success";
  statusCode: number;
  message?: string;
  data: T;
};

export type ApiErrorResponse = {
  status: "error";
  statusCode: number;
  message: string;
};

export async function apiGet<T>(url: string): Promise<T> {
  const { data } = await api.get<ApiSuccessResponse<T>>(url);
  return data.data;
}

export async function apiPost<T, B = unknown>(url: string, body?: B): Promise<T> {
  const { data } = await api.post<ApiSuccessResponse<T>>(url, body);
  return data.data;
}

export async function apiPatch<T, B = unknown>(url: string, body?: B): Promise<T> {
  const { data } = await api.patch<ApiSuccessResponse<T>>(url, body);
  return data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const { data } = await api.delete<ApiSuccessResponse<T>>(url);
  return data.data;
}
