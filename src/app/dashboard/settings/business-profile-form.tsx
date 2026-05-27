"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { updateBusinessProfileAction } from "./actions";

const TIMEZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Madrid",
  "Atlantic/Canary",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
] as const;

type BusinessProfileFormProps = {
  businessId: string;
  initialName: string;
  initialWebsiteUrl: string;
  initialLogoUrl: string;
  initialTimeZone: string;
  bookingSlug: string | null;
};

export function BusinessProfileForm({
  businessId,
  initialName,
  initialWebsiteUrl,
  initialLogoUrl,
  initialTimeZone,
  bookingSlug,
}: BusinessProfileFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        const fd = new FormData(e.currentTarget);
        startTransition(() => {
          void updateBusinessProfileAction(fd).then((res) => {
            if (!res.ok) {
              setError(res.message);
              return;
            }
            setSaved(true);
            router.refresh();
          });
        });
      }}
    >
      <input type="hidden" name="business_id" value={businessId} />

      <label className="block space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="settings-biz-name">
        Business name
        <input
          id="settings-biz-name"
          name="name"
          defaultValue={initialName}
          required
          minLength={2}
          className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] font-normal outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="settings-biz-tz">
          Time zone
          <select
            id="settings-biz-tz"
            name="time_zone"
            defaultValue={initialTimeZone || "UTC"}
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-white px-4 text-[15px] font-normal outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="settings-biz-www">
          Website <span className="font-normal text-[#94a3b8]">(optional)</span>
          <input
            id="settings-biz-www"
            name="website_url"
            type="url"
            defaultValue={initialWebsiteUrl}
            placeholder="https://…"
            className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] font-normal outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
          />
        </label>
      </div>

      <label className="block space-y-2 text-sm font-semibold text-[#0f172a]" htmlFor="settings-biz-logo">
        Logo URL <span className="font-normal text-[#94a3b8]">(optional)</span>
        <input
          id="settings-biz-logo"
          name="logo_url"
          type="url"
          defaultValue={initialLogoUrl}
          placeholder="https://…"
          className="h-11 w-full rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 text-[15px] font-normal outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
        />
        <p className="text-[13px] font-normal text-[#64748b]">
          Shown at the top of your public <span className="font-medium">/book</span> page — use a square image URL.
        </p>
      </label>

      {bookingSlug ? (
        <p className="text-sm text-[#64748b]">
          Public booking slug: <span className="font-semibold text-[#0f172a]">{bookingSlug}</span> — edit under{" "}
          <a href="/dashboard/bookings#booking-links" className="font-semibold text-[#7c3aed] underline-offset-4 hover:underline">
            Bookings → Guest link
          </a>
          .
        </p>
      ) : (
        <p className="text-sm text-[#64748b]">
          Saving will auto-generate your public booking slug if you don&apos;t have one yet.
        </p>
      )}

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      ) : null}
      {saved ? (
        <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Profile saved.
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-11 rounded-full px-6 font-semibold">
        {pending ? (
          <>
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
            Saving…
          </>
        ) : (
          "Save business profile"
        )}
      </Button>
    </form>
  );
}
