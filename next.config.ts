import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vehicle images are served from dynamic dealer CDN domains (MarketCheck /
  // Auto.dev sources). Wildcard remotePatterns lets next/image pass through
  // any HTTPS URL without running the built-in optimizer, avoiding the need
  // to enumerate every possible CDN hostname.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
