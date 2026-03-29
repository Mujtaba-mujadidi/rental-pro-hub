import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rph/shared"],
  /** Default ~1MB breaks multipart server actions with two licence photos (5MB each cap in app). */
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
