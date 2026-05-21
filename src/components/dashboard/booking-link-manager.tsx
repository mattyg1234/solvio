"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

import { ensureBookingSlugAction } from "@/app/dashboard/settings/actions";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BusinessRow = {
  id: string;
  name: string;
  booking_slug: string | null;
};

export function BookingLinkManager({ businesses, siteUrl }: { businesses: BusinessRow[]; siteUrl: string }) {
  if (!businesses.length) {
    return (
      <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        No business profile yet — complete signup with a business name, then refresh this page.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {businesses.map((b) => (
        <BookingLinkCard key={b.id} business={b} siteUrl={siteUrl} />
      ))}
    </div>
  );
}

function BookingLinkCard({ business, siteUrl }: { business: BusinessRow; siteUrl: string }) {
  const [slug, setSlug] = useState((business.booking_slug ?? "").trim());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // First-time auto-provision: if the business has no slug yet, ask the server to mint one.
  useEffect(() => {
    if (slug) return;
    startTransition(() => {
      void ensureBookingSlugAction(business.id).then((res) => {
        if (res.ok) setSlug(res.slug);
        else setError(res.message);
      });
    });
    // Run once per business; slug change handled by the response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  const publicUrl = slug ? `${siteUrl}/book/${slug}` : null;

  async function copyUrl() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the URL manually.");
    }
  }

  return (
    <div className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Hosted on Solvio</p>
          <h2 className="text-lg font-semibold text-[#0f172a]">{business.name}</h2>
          <p className="max-w-xl text-sm leading-relaxed text-[#64748b]">
            Customers open this link, submit email and phone, and requests land in your inbox below.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
          <Link2 className="h-6 w-6" aria-hidden />
        </span>
      </div>

      <div className="mt-6 space-y-3">
        <p className="text-sm font-semibold text-[#0f172a]">Your booking link</p>
        {publicUrl ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[15px]">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-[14px] text-[#5b21b6] hover:underline"
            >
              {publicUrl}
            </a>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full border-[#ebe7f7] font-semibold")}
              onClick={() => void copyUrl()}
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 inline h-4 w-4 text-emerald-600" aria-hidden />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Copy
                </>
              )}
            </button>
          </div>
        ) : pending ? (
          <p className="inline-flex items-center gap-2 text-sm text-[#64748b]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Reserving your link…
          </p>
        ) : null}
        <p className="text-xs text-[#94a3b8]">
          This link is permanent — share it confidently. It&apos;s generated from your business name so customers always
          recognise it.
        </p>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      ) : null}
    </div>
  );
}
