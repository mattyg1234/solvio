"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showOps = pathname.startsWith("/dashboard/show-ops");

  return (
    <main
      className={cn(
        "relative mx-auto w-full flex-1 px-4 py-6 md:px-8",
        showOps ? "max-w-[88rem] md:py-8" : "max-w-6xl md:py-10",
      )}
    >
      {children}
    </main>
  );
}
