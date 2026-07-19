import type { AuthUser } from "@/features/auth/types/auth.types";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_KEY, USER_KEY } from "./constants";

const ACCESS_TOKEN_KEY = ACCESS_TOKEN_COOKIE;

export function setAccessToken(token: string) {
  document.cookie = `${ACCESS_TOKEN_KEY}=${token}; path=/; max-age=${60 * 15}; SameSite=Lax`;
}

export function getAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${ACCESS_TOKEN_KEY}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function clearAccessToken() {
  document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0`;
}

export function setRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken() {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function setStoredUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
}

export function clearSession() {
  clearAccessToken();
  clearRefreshToken();
  clearStoredUser();
}

export function setSession(accessToken: string, refreshToken: string, user: AuthUser) {
  setAccessToken(accessToken);
  setRefreshToken(refreshToken);
  setStoredUser(user);
}
