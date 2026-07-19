import { apiGet, apiPost } from "@/lib/api/apiClient";
import { API_ROUTES } from "@/lib/constants/apiRoutes";
import type { AuthUser, LoginPayload, LoginResponse, RegisterPayload } from "../types/auth.types";

export async function loginRequest(payload: LoginPayload): Promise<LoginResponse> {
  return apiPost<LoginResponse>(API_ROUTES.auth.login, payload);
}

export async function logoutRequest(refreshToken: string): Promise<void> {
  return apiPost<void>(API_ROUTES.auth.logout, { refreshToken });
}

export async function getMeRequest(): Promise<AuthUser> {
  const result = await apiGet<{ user: AuthUser }>(API_ROUTES.auth.me);
  return result.user;
}

export async function registerRequest(payload: RegisterPayload): Promise<LoginResponse> {
  return apiPost<LoginResponse>(API_ROUTES.auth.register, payload);
}

export async function forgotPasswordRequest(email: string): Promise<void> {
  return apiPost<void>(API_ROUTES.auth.forgotPassword, { email });
}
