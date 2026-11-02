"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { NEW_BOOKING_PATH, showNewBookingFab } from "@/lib/show-ops/nav";

/** Floating round "+" in the bottom right that opens the new booking form. */
export function NewBookingFab({ color }: { color: string }) {
  const pathname = usePathname() ?? "";
  if (!showNewBookingFab(pathname)) return null;

  return (
    <Link
      href={NEW_BOOKING_PATH}
      aria-label="New booking"
      title="New booking"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl ring-4 ring-white/70 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-white active:scale-95 print:hidden md:bottom-8 md:right-8 md:h-16 md:w-16"
      style={{ backgroundColor: color, boxShadow: `0 16px 36px -12px ${color}` }}
    >
      <Plus className="h-7 w-7 md:h-8 md:w-8" strokeWidth={2.75} aria-hidden />
    </Link>
  );
}
