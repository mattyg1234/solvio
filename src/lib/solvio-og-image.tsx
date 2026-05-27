import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { SITE_METADATA_DESCRIPTION, SITE_METADATA_TITLE } from "@/lib/site-metadata-copy";

export const ogImageSize = { width: 1200, height: 630 };

export const ogImageContentType = "image/png";

export async function renderSolvioOgImage() {
  const iconPath = join(process.cwd(), "public/brand/icon-512.png");
  const iconBuffer = await readFile(iconPath);
  const iconSrc = `data:image/png;base64,${iconBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #faf5ff 0%, #ffffff 45%, #f8fafc 100%)",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- OG ImageResponse requires img */}
          <img src={iconSrc} alt="" width={112} height={112} style={{ borderRadius: 28 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 72, fontWeight: 700, color: "#0f172a", letterSpacing: -2 }}>
              Solvio
            </div>
            <div style={{ fontSize: 34, fontWeight: 600, color: "#7c3aed", letterSpacing: -0.5 }}>
              Booking solutions for your business
            </div>
          </div>
        </div>
        <p
          style={{
            marginTop: 40,
            maxWidth: 920,
            fontSize: 28,
            lineHeight: 1.45,
            color: "#475569",
          }}
        >
          {SITE_METADATA_DESCRIPTION}
        </p>
      </div>
    ),
    {
      ...ogImageSize,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}

export const ogImageAlt = SITE_METADATA_TITLE;
