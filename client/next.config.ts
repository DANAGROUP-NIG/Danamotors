import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moved pages; keep old links, bookmarks and stored notification links working.
  async redirects() {
    return [
      { source: "/inventory", destination: "/part-master", permanent: true },
      // Part detail moved from /inventory/<uuid>; the uuid pattern leaves /inventory/mit etc. alone.
      {
        source: "/inventory/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
        destination: "/part-master/:id",
        permanent: true,
      },
      { source: "/inventory/mobis-receipts", destination: "/inventory/mit", permanent: true },
      { source: "/inventory/mobis-receipts/:path*", destination: "/inventory/mit/:path*", permanent: true },
      { source: "/inventory/vendor-receipts", destination: "/inventory/mrn", permanent: true },
      { source: "/inventory/vendor-receipts/:path*", destination: "/inventory/mrn/:path*", permanent: true },
    ];
  },
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
