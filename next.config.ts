import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is per-user data fetched in the browser under Row Level Security,
  // so Cache Components / Partial Prerendering bring no benefit here.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The Money and PT Packages pages were merged into Membership (Oct 2026).
  async redirects() {
    return [
      { source: "/finance", destination: "/membership/spending", permanent: false },
      { source: "/packages", destination: "/membership/training", permanent: false },
      // Workouts are logged on the Today page now.
      { source: "/workouts/new", destination: "/#today-workout", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
