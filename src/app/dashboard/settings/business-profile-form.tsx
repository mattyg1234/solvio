"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BUSINESS_LOGO_ACCEPT, BUSINESS_LOGO_MAX_BYTES } from "@/lib/business-logo";
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
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

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

      <div className="space-y-2 text-sm font-semibold text-[#0f172a]">
        <label htmlFor="settings-biz-logo">Logo</label>
        <div className="flex items-center gap-4 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3">
          {logoPreview || initialLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreview || initialLogoUrl}
              alt="Current logo"
              className="h-14 w-28 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-[#ebe7f7]"
            />
          ) : (
            <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-semibold uppercase tracking-wide text-[#a78bfa] ring-1 ring-[#ebe7f7]">
              No logo yet
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <input
              id="settings-biz-logo"
              name="logo"
              type="file"
              accept={BUSINESS_LOGO_ACCEPT}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (logoPreview) URL.revokeObjectURL(logoPreview);
                if (!file) return setLogoPreview(null);
                if (!["image/png", "image/jpeg"].includes(file.type) || file.size > BUSINESS_LOGO_MAX_BYTES) {
                  setError("Logo must be a PNG or JPEG under 2 MB.");
                  e.target.value = "";
                  return setLogoPreview(null);
                }
                setError(null);
                setLogoPreview(URL.createObjectURL(file));
              }}
              className="block w-full text-[13px] font-normal text-[#475569] file:mr-3 file:rounded-full file:border-0 file:bg-[#7c3aed] file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-white hover:file:bg-[#6d28d9]"
            />
            <p className="text-[13px] font-normal text-[#64748b]">
              PNG or JPEG, up to 2 MB. Printed in the header of every invoice and shown on your{" "}
              <span className="font-medium">/book</span> page.
            </p>
          </div>
        </div>
      </div>

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
