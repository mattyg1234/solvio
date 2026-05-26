"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isStaleAuthSessionError } from "@/lib/supabase/auth-errors";

/**
 * Clears broken Supabase cookies client-side (e.g. after Volvio reset or Tipsi → Volvio cutover).
 */
export function AuthSessionRecovery() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    void (async () => {
      const { error } = await supabase.auth.getSession();
      if (!error || !isStaleAuthSessionError(error.message)) return;

      await supabase.auth.signOut();
      if (pathname.startsWith("/dashboard")) {
        router.replace(`/login?error=${encodeURIComponent("Your session expired — please sign in again.")}`);
        router.refresh();
      }
    })();
  }, [pathname, router]);

  return null;
}
