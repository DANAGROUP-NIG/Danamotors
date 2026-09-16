"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { AppRole } from "@/features/auth/roles";

interface RouteGuardProps {
  /** Permission strings required per route. Keys are route prefixes. */
  routePermissions?: Record<string, string[]>;
  /** Legacy role-based access — fallback when `routePermissions` is not set. */
  routeRoles?: Record<string, AppRole[]>;
  children: React.ReactNode;
  fallbackRoute?: string;
}

export function RouteGuard({
  routePermissions,
  routeRoles,
  children,
  fallbackRoute = "/dashboard",
}: RouteGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasAccess, hasAnyPermission, isHydrated, user } = useAuth();

  // Try permission-based matching first, then fall back to role-based
  let requiredAccess: { kind: "permission" | "role"; values: string[] } | null = null;

  if (routePermissions) {
    const matchedKey = Object.keys(routePermissions).find((key) =>
      pathname.startsWith(key),
    );
    if (matchedKey && routePermissions[matchedKey]?.length) {
      requiredAccess = { kind: "permission", values: routePermissions[matchedKey] };
    }
  }

  if (!requiredAccess && routeRoles) {
    const matchedKey = Object.keys(routeRoles).find((key) =>
      pathname.startsWith(key),
    );
    if (matchedKey && routeRoles[matchedKey]?.length) {
      requiredAccess = { kind: "role", values: routeRoles[matchedKey] };
    }
  }

  useEffect(() => {
    if (!isHydrated) return;
    if (!requiredAccess) return;

    const allowed =
      requiredAccess.kind === "permission"
        ? hasAnyPermission(requiredAccess.values)
        : hasAccess(requiredAccess.values as AppRole[]);

    if (allowed) return;

    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackRoute);
    }
  }, [isHydrated, pathname]);

  if (!isHydrated || !user) return null;

  if (requiredAccess) {
    const allowed =
      requiredAccess.kind === "permission"
        ? hasAnyPermission(requiredAccess.values)
        : hasAccess(requiredAccess.values as AppRole[]);
    if (!allowed) return null;
  }

  return <>{children}</>;
}
