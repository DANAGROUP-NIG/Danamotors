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
  /** Optional in-place access message for screens that must not redirect on denial. */
  deniedMessage?: string;
}

export function RouteGuard({
  routePermissions,
  routeRoles,
  children,
  fallbackRoute = "/dashboard",
  deniedMessage,
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

  const allowed = !requiredAccess || (requiredAccess.kind === 'permission'
    ? hasAnyPermission(requiredAccess.values)
    : hasAccess(requiredAccess.values as AppRole[]));

  useEffect(() => {
    if (!isHydrated || allowed || deniedMessage) return;

    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackRoute);
    }
  }, [isHydrated, pathname, allowed, deniedMessage, fallbackRoute, router]);

  if (!isHydrated || !user) return null;

  if (!allowed) return deniedMessage ? <p role="alert" className="p-4 text-sm">{deniedMessage}</p> : null;

  return <>{children}</>;
}
