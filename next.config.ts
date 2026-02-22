import type { NextConfig } from "next";

// Use build-time ID to version static assets and bust CDN cache across deployments.
// Fly.io CDN caches /_next/static/* with immutable headers from old deploys;
// changing the assetPrefix ensures browsers request new URLs that aren't in CDN cache.
const ASSET_VERSION = process.env.ASSET_VERSION || "v8";

// Generate build timestamp for version display: V1.0.YYYYMMDD.HHmmss
const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const BUILD_DATE = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const BUILD_TIME = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const BUILD_VERSION = `V1.0.${BUILD_DATE}.${BUILD_TIME}`;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
  },
  output: "standalone",
  assetPrefix: process.env.NODE_ENV === "production" ? `/${ASSET_VERSION}` : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
