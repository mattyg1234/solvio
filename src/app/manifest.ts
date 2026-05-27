import type { MetadataRoute } from "next";

import { SITE_METADATA_DESCRIPTION } from "@/lib/site-metadata-copy";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solvio — booking solutions for your business",
    short_name: "Solvio",
    description: SITE_METADATA_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#7c3aed",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
