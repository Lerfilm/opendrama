import type { NextConfig } from "next";

// Use build-time ID to version static assets and bust CDN cache across deployments.
// Fly.io CDN caches /_next/static/* with immutable headers from old deploys;
// changing the assetPrefix ensures browsers request new URLs that aren't in CDN cache.
const ASSET_VERSION = process.env.ASSET_VERSION || "v7";

const nextConfig: NextConfig = {
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
