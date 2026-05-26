"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

import { ensureBookingSlugAction } from "@/app/dashboard/settings/actions";
import { saveGuestBookingModesAction } from "@/app/dashboard/setup/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  BOOKING_GUEST_MODE_LABELS,
  type BookingGuestMode,
} from "@/lib/booking-guest-modes";
import { modeLinkLabel, publicBookingUrl } from "@/lib/booking-public-links";
import { cn } from "@/lib/utils";

const MODE_ORDER: BookingGuestMode[] = ["appointment", "event", "table", "walk_in"];

export type BookingLinkBusiness = {
  id: string;
  name: string;
  booking_slug: string | null;
  guestModes: BookingGuestMode[];
};

export function BookingLinkManager({
  businesses,
  siteUrl,
}: {
  businesses: BookingLinkBusiness[];
  siteUrl: string;
}) {
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

function CopyLinkRow({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-[#64748b]">{label}</p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate font-mono text-[13px] text-[#5b21b6] hover:underline"
        >
          {url}
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
    </div>
  );
}

function BookingLinkCard({ business, siteUrl }: { business: BookingLinkBusiness; siteUrl: string }) {
  const [slug, setSlug] = useState((business.booking_slug ?? "").trim());
  const [guestModes, setGuestModes] = useState<BookingGuestMode[]>(business.guestModes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setGuestModes(business.guestModes);
  }, [business.guestModes]);

  useEffect(() => {
    if (slug) return;
    startTransition(() => {
      void ensureBookingSlugAction(business.id).then((res) => {
        if (res.ok) setSlug(res.slug);
        else setError(res.message);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  const mainUrl = slug ? publicBookingUrl(siteUrl, slug) : null;

  function toggleMode(mode: BookingGuestMode) {
    setSaved(false);
    setGuestModes((prev) => {
      if (prev.includes(mode)) {
        const next = prev.filter((m) => m !== mode);
        return next.length ? next : prev;
      }
      return [...prev, mode].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
    });
  }

  function saveModes() {
    setError(null);
    setSaved(false);
    startTransition(() => {
      void saveGuestBookingModesAction(business.id, guestModes).then((res) => {
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setSaved(true);
      });
    });
  }

  return (
    <div className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Hosted on Solvio</p>
          <h2 className="text-lg font-semibold text-[#0f172a]">{business.name}</h2>
          <p className="max-w-xl text-sm leading-relaxed text-[#64748b]">
            Choose what guests see on your booking page. Use one main link, or share a focused link per booking type.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
          <Link2 className="h-6 w-6" aria-hidden />
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-[#ede9fe] bg-[#fafbff]/90 px-4 py-4">
        <p className="text-sm font-semibold text-[#0f172a]">Show on booking page</p>
        <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
          For a hair salon, turn off Events and Tables — guests only need Appointments. Keep at least one option on.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MODE_ORDER.map((mode) => {
            const active = guestModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                disabled={pending}
                onClick={() => toggleMode(mode)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "border-[#a78bfa] bg-[#f5f3ff] text-[#5b21b6]"
                    : "border-[#ebe7f7] bg-white text-[#64748b] hover:border-[#ddd6fe]",
                )}
              >
                {BOOKING_GUEST_MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={saveModes}
            className={cn(buttonVariants({ variant: "default" }), "h-9 rounded-full px-4 text-sm font-semibold")}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Save booking options
          </button>
          {saved ? <span className="text-sm font-medium text-emerald-700">Saved — public page updated.</span> : null}
          <Link href="/dashboard/setup/bookings" className="text-sm font-semibold text-[#7c3aed] underline-offset-2 hover:underline">
            Full booking setup →
          </Link>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {mainUrl ? (
          <>
            <CopyLinkRow
              url={mainUrl}
              label={
                guestModes.length === 1
                  ? `Booking link · ${modeLinkLabel(guestModes[0]!)} only`
                  : "Main booking link · shows enabled options"
              }
            />
            {guestModes.length > 1 ? (
              <div className="space-y-3 rounded-2xl border border-[#f1eefc] bg-white px-4 py-4">
                <p className="text-sm font-semibold text-[#0f172a]">Focused links</p>
                <p className="text-xs leading-relaxed text-[#64748b]">
                  Each link opens straight into one flow — useful for Instagram “Book a table” vs “Buy tickets”.
                </p>
                <div className="space-y-3">
                  {guestModes.map((mode) => (
                    <CopyLinkRow
                      key={mode}
                      url={publicBookingUrl(siteUrl, slug, mode)}
                      label={modeLinkLabel(mode)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : pending ? (
          <p className="inline-flex items-center gap-2 text-sm text-[#64748b]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Reserving your link…
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      ) : null}
    </div>
  );
}
