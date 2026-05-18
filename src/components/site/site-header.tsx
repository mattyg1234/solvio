"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "#growth", label: "Growth" },
  { href: "#proof", label: "Stories" },
  { href: "#demo", label: "Try AI" },
  { href: "#contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#ebe7f7]/90 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7c3aed]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-sm font-bold text-white shadow-sm shadow-[#7c3aed]/25">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight text-[#0f172a]">
            Solvio
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-[#64748b] transition-colors hover:bg-[#f8fafc] hover:text-[#0f172a]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="#demo"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden rounded-full px-4 font-medium text-[#64748b] hover:text-[#0f172a] sm:inline-flex",
            )}
          >
            Talk to AI
          </Link>
          <Link
            href="#contact"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-full px-5 font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            Book demo
          </Link>
        </div>
      </div>
    </header>
  );
}
