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

export const viewport: Viewport = {
  themeColor: "#7c3aed",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.solviosystems.com"),
  title: "Solvio · AI reception that grows your business",
  description:
    "Solvio answers calls, books reservations, collects deposits via Stripe Connect, syncs calendars and confirms guests — commerce-ready AI for local businesses.",
  applicationName: "Solvio",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Solvio",
    title: "Solvio · AI reception that grows your business",
    description:
      "AI receptionist that books, takes deposits and confirms guests — purpose-built for restaurants, salons and cafés.",
    url: "https://www.solviosystems.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solvio · AI reception that grows your business",
    description:
      "AI receptionist that books, takes deposits and confirms guests — purpose-built for restaurants, salons and cafés.",
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
