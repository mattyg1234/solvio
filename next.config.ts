import type { NextConfig } from "next";

/**
 * solviosystems.com is Solvio Systems' front page and the Show Ops hub. Solvio Connect lives
 * on its own subdomain; links of its that went out on solviosystems.com keep working.
 */
const CONNECT = "https://connect.solviosystems.com";
const CONNECT_PAGES = ["/start", "/verify", "/reset", "/forgot", "/join", "/pricing", "/a/:path*", "/es/pricing", "/es/start"];

const nextConfig: NextConfig = {
  async redirects() {
    return CONNECT_PAGES.map((source) => ({ source, destination: `${CONNECT}${source}`, permanent: false }));
  },
  async rewrites() {
    // Stripe calls Connect's billing webhook on this address; pass it straight through.
    return [{ source: "/api/billing/:path*", destination: `${CONNECT}/api/billing/:path*` }];
  },
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
