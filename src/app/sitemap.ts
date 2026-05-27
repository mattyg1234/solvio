import type { MetadataRoute } from "next";

import { bookingDemoHref } from "@/lib/marketing-links";

const BASE = "https://www.solviosystems.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/es`, lastModified: now, changeFrequency: "weekly", priority: 0.95 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}${bookingDemoHref()}`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
}
