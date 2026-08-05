"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AppRole } from "@/features/auth/roles";

interface RouteGuardProps {
  routeRoles: Record<string, AppRole[]>;
  children: React.ReactNode;
  fallbackRoute?: string;
}

export function RouteGuard({
  routeRoles,
  children,
  fallbackRoute = "/dashboard",
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasAccess, isHydrated, user } = useAuth();

  const matchedKey =
    Object.keys(routeRoles).find((key) => pathname.startsWith(key)) ?? "";
  const requiredRoles = routeRoles[matchedKey] ?? null;

  useEffect(() => {
    if (!isHydrated) return;
    if (!requiredRoles || hasAccess(requiredRoles)) return;

    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackRoute);
    }
  }, [isHydrated, pathname]);

  if (!isHydrated || !user) return null;
  if (requiredRoles && !hasAccess(requiredRoles)) return null;

  return <>{children}</>;
}
