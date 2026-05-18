"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { SolvioWordmark } from "@/components/brand/solvio-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/#growth", label: "Growth" },
  { href: "/#commerce", label: "Commerce" },
  { href: "/#proof", label: "Stories" },
  { href: "/#demo", label: "Try AI" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
  const reduce = useReducedMotion();

  return (
    <header className="sticky top-0 z-50 border-b border-[#ebe7f7]/90 bg-white/80 backdrop-blur-xl supports-[backdrop-filter]:bg-white/65">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-xl outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[#7c3aed]">
          <motion.span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a78bfa] text-sm font-bold text-white shadow-sm shadow-[#7c3aed]/25"
            initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: reduce ? 0 : 0.4,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : 0.02,
            }}
          >
            S
          </motion.span>
          <SolvioWordmark className="text-lg font-semibold tracking-tight text-[#0f172a]" delay={reduce ? 0 : 0.12} />
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

        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-full px-3 font-semibold text-[#64748b] hover:text-[#0f172a]",
            )}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "rounded-full border-[#ebe7f7] px-4 font-semibold text-[#0f172a] hover:bg-[#f8fafc]",
            )}
          >
            Sign up
          </Link>
          <Link
            href="/#demo"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden rounded-full px-4 font-medium text-[#64748b] hover:text-[#0f172a] lg:inline-flex",
            )}
          >
            Talk to AI
          </Link>
          <Link
            href="/#contact"
            className={cn(
              buttonVariants({ variant: "default", size: "sm" }),
              "rounded-full px-4 font-semibold shadow-md shadow-[#7c3aed]/20 sm:px-5",
            )}
          >
            Book demo
          </Link>
        </div>
      </div>
    </header>
  );
}
