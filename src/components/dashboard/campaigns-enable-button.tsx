"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { toggleCampaignsEnabledAction } from "@/app/dashboard/campaigns/actions";
import { Button } from "@/components/ui/button";

export function CampaignsEnableButton({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          await toggleCampaignsEnabledAction(businessId, true);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not enable.");
        }
      })();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="h-11 w-full rounded-full font-semibold shadow-md shadow-[#7c3aed]/20"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
            Enabling…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 inline h-4 w-4" aria-hidden />
            Enable AI Voice Campaigns
          </>
        )}
      </Button>
      {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</p> : null}
    </div>
  );
}
