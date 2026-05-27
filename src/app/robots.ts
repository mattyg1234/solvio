import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/admin/", "/auth/", "/account"],
    },
    sitemap: "https://www.solviosystems.com/sitemap.xml",
  };
}
