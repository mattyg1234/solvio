"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Phone, X } from "lucide-react";

import {
  purchaseBusinessPhoneNumberAction,
  releaseBusinessPhoneNumberAction,
} from "@/app/dashboard/phone/actions";
import { buttonVariants } from "@/components/ui/button";
import { SUPPORTED_PHONE_COUNTRIES } from "@/lib/vapi-phone-numbers";
import { cn } from "@/lib/utils";

type BusinessRow = {
  id: string;
  name: string;
  hasAssistant: boolean;
  phoneNumberId: string | null;
  phoneNumberE164: string | null;
  country: string | null;
};

export function PhoneNumberManager({ businesses }: { businesses: BusinessRow[] }) {
  if (!businesses.length) {
    return (
      <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        No business yet — complete signup first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {businesses.map((b) => (
        <PhoneCard key={b.id} business={b} />
      ))}
    </div>
  );
}

function PhoneCard({ business }: { business: BusinessRow }) {
  const [country, setCountry] = useState<string>(business.country ?? "GB");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmRelease, setConfirmRelease] = useState(false);
  // Optimistic state mirrors server data so the card updates instantly after a purchase/release.
  const [owned, setOwned] = useState<{ e164: string; country: string | null } | null>(
    business.phoneNumberE164 ? { e164: business.phoneNumberE164, country: business.country } : null,
  );

  function handlePurchase() {
    setError(null);
    startTransition(() => {
      void purchaseBusinessPhoneNumberAction({ businessId: business.id, country }).then((res) => {
        if (res.ok) setOwned({ e164: res.phoneE164, country });
        else setError(res.message);
      });
    });
  }

  function handleRelease() {
    setError(null);
    startTransition(() => {
      void releaseBusinessPhoneNumberAction({ businessId: business.id }).then((res) => {
        if (res.ok) {
          setOwned(null);
          setConfirmRelease(false);
        } else {
          setError(res.message);
        }
      });
    });
  }

  return (
    <div className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-[#0f172a]">{business.name}</h2>
          <p className="text-sm text-[#64748b]">
            {owned
              ? "Inbound calls answer with your saved receptionist."
              : "Pick a country, then claim a number. Goes live immediately."}
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f5f3ff] text-[#7c3aed] ring-1 ring-[#ebe7f7]">
          <Phone className="h-6 w-6" aria-hidden />
        </span>
      </div>

      {owned ? (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[15px] text-emerald-950">
            <Check className="h-4 w-4 text-emerald-700" aria-hidden />
            <span className="font-mono text-[15px] font-semibold">{owned.e164}</span>
            {owned.country ? (
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-900">
                {owned.country}
              </span>
            ) : null}
          </div>
          {!confirmRelease ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmRelease(true)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "rounded-full border-rose-200 text-rose-700 hover:bg-rose-50",
              )}
            >
              Release number
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
              <p className="basis-full text-sm text-rose-900">
                Release this number? Inbound calls will stop and the number returns to the pool — customers using it
                will get a disconnect tone.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={handleRelease}
                className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full")}
              >
                {pending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden /> : null}
                Yes, release
              </button>
              <button
                type="button"
                onClick={() => setConfirmRelease(false)}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full")}
              >
                <X className="mr-1.5 inline h-4 w-4" aria-hidden />
                Keep it
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {!business.hasAssistant ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Set up your AI receptionist first — save it once on the receptionist page, then come back here to claim a
              number.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-[#0f172a]" htmlFor={`country-${business.id}`}>
                Country
              </label>
              <select
                id={`country-${business.id}`}
                value={country}
                disabled={pending || !business.hasAssistant}
                onChange={(e) => setCountry(e.target.value)}
                className="h-11 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[15px] text-[#0f172a] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
              >
                {SUPPORTED_PHONE_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={pending || !business.hasAssistant}
              onClick={handlePurchase}
              className={cn(
                buttonVariants({ variant: "default" }),
                "rounded-full font-semibold shadow-md shadow-[#7c3aed]/20",
              )}
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                  Claiming…
                </>
              ) : (
                "Claim a number"
              )}
            </button>
          </div>
          <p className="text-xs text-[#94a3b8]">
            Carrier fee is included in your plan. You can release the number any time.
          </p>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-900">{error}</p>
      ) : null}
    </div>
  );
}
