import type { NextConfig } from "next";

/** Headroom above app upload cap for multipart boundaries and field metadata. */
const UPLOAD_BODY_LIMIT = "14mb";

const nextConfig: NextConfig = {
  transpilePackages: ["@rph/shared"],
  experimental: {
    /** Middleware buffers the full request body (default 10MB truncates server-action uploads). */
    middlewareClientMaxBodySize: UPLOAD_BODY_LIMIT,
    serverActions: {
      bodySizeLimit: UPLOAD_BODY_LIMIT,
    },
  },
};

export default nextConfig;
