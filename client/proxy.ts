import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Inlined — middleware runs in the Edge runtime and cannot safely resolve
// path aliases (@/) or import from app code.
const ACCESS_TOKEN_COOKIE = "danamotors_access_token";

const protectedPrefixes = [
  "/dashboard",
  "/customers",
  "/vehicles",
  "/appointments",
  "/inspections",
  "/job-cards",
  "/technicians",
  "/inventory",
  "/suppliers",
  "/quotations",
  "/invoices",
  "/payments",
  "/repairs",
  "/purchasing",
  "/finance",
  "/reports",
  "/analytics",
  "/settings",
  "/portal",
];

const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

// Edge-safe JWT payload decode (no Buffer, no node modules).
function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

function roleHome(role: string | null): string {
  return role === "customer" ? "/portal" : "/dashboard";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const isPublic = publicRoutes.some((route) => pathname === route);

  // Unauthenticated user hitting a protected route → redirect to login
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting any public route → redirect to their home
  if (token && isPublic) {
    return NextResponse.redirect(new URL(roleHome(decodeJwtRole(token)), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
