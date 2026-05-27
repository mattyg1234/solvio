import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { SITE_METADATA_DESCRIPTION, SITE_METADATA_TITLE, SITE_OG_DESCRIPTION } from "@/lib/site-metadata-copy";

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.solviosystems.com"),
  title: SITE_METADATA_TITLE,
  description: SITE_METADATA_DESCRIPTION,
  applicationName: "Solvio",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Solvio",
    title: SITE_METADATA_TITLE,
    description: SITE_OG_DESCRIPTION,
    url: "https://www.solviosystems.com",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_METADATA_TITLE,
    description: SITE_OG_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${geistSans.className} antialiased`}
      >
        <AuthSessionRecovery />
        {children}
      </body>
    </html>
  );
}
