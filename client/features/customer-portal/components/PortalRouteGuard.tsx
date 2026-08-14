"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";

export function PortalRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isHydrated, isAuthenticated, isCustomer } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login?redirect=/portal");
      return;
    }
    if (!isCustomer) {
      router.replace("/dashboard");
    }
  }, [isHydrated, isAuthenticated, isCustomer, router]);

  if (!isHydrated || !isAuthenticated || !isCustomer) return null;

  return <>{children}</>;
}
