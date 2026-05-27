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
  title: "Solvio · Booking pages with Stripe deposits",
  description:
    "Launch a public booking link in minutes. Guests pick appointments, tables or events and pay deposits straight to your Stripe account — optional AI receptionist on Pro.",
  applicationName: "Solvio",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Solvio",
    title: "Solvio · Booking pages with Stripe deposits",
    description:
      "Public /book pages for restaurants, salons and cafés — appointments, tables, events, and Stripe Connect checkout.",
    url: "https://www.solviosystems.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solvio · Booking pages with Stripe deposits",
    description:
      "Public /book pages for restaurants, salons and cafés — appointments, tables, events, and Stripe Connect checkout.",
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
