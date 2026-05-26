"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isPathAllowedDuringOnboarding } from "@/lib/onboarding-routes";

type OnboardingGateProps = {
  needsOnboarding: boolean;
};

/** Redirects authenticated merchants who haven’t finished the platform wizard yet. */
export function OnboardingGate({ needsOnboarding }: OnboardingGateProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!needsOnboarding) return;
    if (isPathAllowedDuringOnboarding(pathname)) return;
    router.replace("/dashboard/onboarding");
  }, [needsOnboarding, pathname, router]);

  return null;
}
