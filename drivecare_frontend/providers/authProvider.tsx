"use client";

import { useEffect } from "react";
import { clearSession, getAccessTokenFromCookie, getStoredUser } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth.store";
import { getMeRequest } from "@/features/auth/api/auth.api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, reset, setHydrated } = useAuthStore();

  useEffect(() => {
    async function hydrateSession() {
      const token = getAccessTokenFromCookie();

      if (!token) {
        reset();
        setHydrated(true);
        return;
      }

      const storedUser = getStoredUser();
      if (storedUser) {
        setUser(storedUser);
        setHydrated(true);

        // Background refresh — silently update user data if backend is reachable.
        // On 401/403/404 the token is invalid — clear the session so the user
        // is prompted to log in again on next navigation.
        getMeRequest()
          .then((freshUser) => setUser(freshUser))
          .catch((err) => {
            const status = err?.response?.status;
            if (status === 401 || status === 403 || status === 404) {
              clearSession();
              reset();
            }
            // Network errors / 5xx — keep the stored user, try again later
          });

        return;
      }

      // No stored user but we have a token — try the server.
      try {
        const user = await getMeRequest();
        setUser(user);
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        // Only clear session if token is explicitly rejected (401/403/404)
        if (status === 401 || status === 403 || status === 404) {
          clearSession();
          reset();
        }
      } finally {
        setHydrated(true);
      }
    }

    hydrateSession();
  }, [setUser, reset, setHydrated]);

  return <>{children}</>;
}
