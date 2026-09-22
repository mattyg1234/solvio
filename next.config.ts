import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // GetYourGuide calls /api/gyg/v1/1/<endpoint>/ with a trailing slash and treats any non-200 (incl. a 308) as failure.
  skipTrailingSlashRedirect: true,
  // Ruth's confirmation template is read from disk at request time; make sure the
  // serverless bundle for that route carries it.
  outputFileTracingIncludes: {
    "/dashboard/show-ops/bookings/[id]/confirmation.pdf": ["./src/lib/show-ops/templates/**"],
  },
};

export default nextConfig;
