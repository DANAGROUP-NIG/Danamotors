import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy /api/* to the backend so the frontend always calls a same-origin
    // URL (no CORS in the browser). The destination comes from
    // NEXT_PUBLIC_API_URL, with environment-aware fallbacks.
    const isProd = process.env.NODE_ENV === "production";
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      (isProd
        ? "https://danamotors.danagroup.net/api"
        : "http://localhost:8000/api");
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
