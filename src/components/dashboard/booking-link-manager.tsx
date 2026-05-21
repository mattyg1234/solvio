"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";

import { publishBookingSlugAction } from "@/app/dashboard/settings/actions";
import { suggestBookingSlug, isValidBookingSlug } from "@/lib/booking-slug";
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
  const suggested = useMemo(() => suggestBookingSlug(business.name, business.id), [business.name, business.id]);
  const [slug, setSlug] = useState((business.booking_slug ?? "").trim() || suggested);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(Boolean(business.booking_slug));

  const publicUrl = `${siteUrl}/book/${encodeURIComponent(slug.trim())}`;

  async function saveSlug() {
    setError(null);
    const next = slug.trim().toLowerCase();
    if (!isValidBookingSlug(next)) {
      setError("Use 3–48 characters: lowercase letters, numbers, and single hyphens between words.");
      return;
    }
    setSaving(true);
    try {
      const res = await publishBookingSlugAction(business.id, next);
      if (!res.ok) {
        setError(res.message);
        setSavedOk(false);
        return;
      }
      setSlug(res.slug);
      setSavedOk(true);
    } finally {
      setSaving(false);
    }
  }

  async function copyUrl() {
    const next = slug.trim().toLowerCase();
    if (!isValidBookingSlug(next) || !savedOk) return;
    try {
      await navigator.clipboard.writeText(`${siteUrl}/book/${next}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the URL manually.");
    }
  }

  return (
    <div className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#94a3b8]">Hosted on Solvio</p>
          <h2 className="text-lg font-semibold text-[#0f172a]">{business.name}</h2>
          <p className="max-w-xl text-sm leading-relaxed text-[#64748b]">
            Customers open your link, submit email and phone, and requests land in the table below — call or SMS them from here.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
          <Link2 className="h-6 w-6" aria-hidden />
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label className="text-sm font-semibold text-[#0f172a]" htmlFor={`slug-${business.id}`}>
            Booking link slug
          </label>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 py-2 text-[15px]">
            <span className="shrink-0 text-[#94a3b8]">{siteUrl.replace(/^https?:\/\//, "")}/book/</span>
            <input
              id={`slug-${business.id}`}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSavedOk(false);
              }}
              className="min-w-[8rem] flex-1 bg-transparent text-[#0f172a] outline-none placeholder:text-[#cbd5e1]"
              placeholder={suggested}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ebe7f7] font-semibold")}
            onClick={() => {
              setSlug(suggested);
              setSavedOk(false);
            }}
          >
            Suggest from name
          </button>
          <button
            type="button"
            disabled={saving}
            className={cn(
              buttonVariants({ variant: "default" }),
              "rounded-full font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
            onClick={() => void saveSlug()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Publish link"
            )}
          </button>
          <button
            type="button"
            disabled={!savedOk || saving}
            className={cn(buttonVariants({ variant: "outline" }), "rounded-full border-[#ebe7f7] font-semibold")}
            onClick={() => void copyUrl()}
          >
            {copied ? (
              <>
                <Check className="mr-2 inline h-4 w-4 text-emerald-600" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 inline h-4 w-4" aria-hidden />
                Copy URL
              </>
            )}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      ) : null}

      {!savedOk ? (
        <p className="mt-4 text-xs font-medium text-[#64748b]">
          Publish saves your slug to Solvio so <span className="text-[#0f172a]">{publicUrl}</span> goes live for guests.
        </p>
      ) : (
        <p className="mt-4 break-all text-xs text-[#94a3b8]">
          Live URL:{" "}
          <a href={publicUrl} className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
            {publicUrl}
          </a>
        </p>
      )}
    </div>
  );
}
