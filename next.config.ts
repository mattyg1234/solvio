import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // GetYourGuide calls /api/gyg/v1/1/<endpoint>/ with a trailing slash and treats any non-200 (incl. a 308) as failure.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
