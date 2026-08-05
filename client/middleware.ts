import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";


// Inlined — middleware runs in the Edge runtime and cannot safely resolve
// path aliases (@/) or import from app code.
const ACCESS_TOKEN_COOKIE = "drivecare_access_token";

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
];

const publicRoutes = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const isPublic = publicRoutes.some(
    (route) => pathname === route,
  );

  // Unauthenticated user hitting a protected route → redirect to login
  if (isProtected && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting any public route → redirect to dashboard
  if (token && isPublic) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
