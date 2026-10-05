import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy /api/* to the backend so the frontend always calls a same-origin
    // URL (no CORS in the browser). The destination comes from
    // NEXT_PUBLIC_API_URL, with environment-aware fallbacks. Accept either the
    // API origin or a base URL that already includes /api.
    const isProd = process.env.NODE_ENV === "production";
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    const defaultApiUrl = isProd
      ? "https://danamotors.danagroup.net/api"
      : "http://localhost:8000/api";
    const apiUrl = configuredApiUrl
      ? /\/api$/i.test(configuredApiUrl)
        ? configuredApiUrl
        : `${configuredApiUrl}/api`
      : defaultApiUrl;
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
