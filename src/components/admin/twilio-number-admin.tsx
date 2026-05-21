"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Phone, PhoneOutgoing, Search } from "lucide-react";

import {
  buyTwilioNumberAction,
  listVapiPhoneNumbersAction,
  registerSolvioOutboundNumberAction,
  searchTwilioNumbersAction,
} from "@/app/admin/twilio/actions";
import { buttonVariants } from "@/components/ui/button";
import type { TwilioAvailableNumber, TwilioOwnedNumber } from "@/lib/twilio-phone-numbers";
import { cn } from "@/lib/utils";

export function TwilioNumberAdmin({ countries }: { countries: readonly string[] }) {
  const [country, setCountry] = useState<string>(countries[0] ?? "GB");
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<TwilioAvailableNumber[]>([]);
  const [searched, setSearched] = useState(false);
  const [bought, setBought] = useState<TwilioOwnedNumber | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [buyingNumber, setBuyingNumber] = useState<string | null>(null);
  const [outboundRegistered, setOutboundRegistered] = useState<{ id: string; e164: string } | null>(null);
  const [registeringOutbound, setRegisteringOutbound] = useState(false);

  function handleRegisterOutbound() {
    setError(null);
    setRegisteringOutbound(true);
    void registerSolvioOutboundNumberAction()
      .then((res) => {
        if (res.ok) {
          setOutboundRegistered({ id: res.vapiPhoneNumberId, e164: res.phoneE164 });
        } else {
          setError(res.message);
        }
      })
      .finally(() => setRegisteringOutbound(false));
  }

  const [vapiNumbers, setVapiNumbers] = useState<
    Array<{ id: string; number: string | null; provider: string | null; name: string | null }> | null
  >(null);
  const [listingNumbers, setListingNumbers] = useState(false);

  function handleListNumbers() {
    setError(null);
    setListingNumbers(true);
    void listVapiPhoneNumbersAction()
      .then((res) => {
        if (res.ok) setVapiNumbers(res.numbers);
        else setError(res.message);
      })
      .finally(() => setListingNumbers(false));
  }

  function handleSearch() {
    setError(null);
    setBought(null);
    startTransition(() => {
      void searchTwilioNumbersAction({ country, areaCode: areaCode.trim() }).then((res) => {
        setSearched(true);
        if (!res.ok) {
          if (!res.configured) {
            setError("Twilio creds not set — see the panel above.");
          } else {
            setError(res.message);
          }
          setResults([]);
        } else {
          setResults(res.numbers);
        }
      });
    });
  }

  function handleBuy(phoneNumber: string) {
    setError(null);
    setBuyingNumber(phoneNumber);
    startTransition(() => {
      void buyTwilioNumberAction({ phoneNumber, friendlyName: "Solvio shared outbound" })
        .then((res) => {
          if (res.ok) {
            setBought(res.number);
            setResults([]);
          } else {
            setError(res.message);
          }
        })
        .finally(() => setBuyingNumber(null));
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[22px] border border-[#7c3aed]/30 bg-gradient-to-br from-[#faf7ff] to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">Shared outbound line</p>
            <h2 className="text-base font-semibold text-[#0f172a]">Register the Solvio outbound number with Vapi</h2>
            <p className="max-w-xl text-sm text-[#64748b]">
              Imports <code className="font-mono text-xs">SOLVIO_TWILIO_FROM_NUMBER</code> into Vapi as a non-assistant
              phone-number resource — required for AI-dialled campaign calls to use it. One-time setup.
            </p>
          </div>
          <button
            type="button"
            disabled={registeringOutbound || Boolean(outboundRegistered)}
            onClick={handleRegisterOutbound}
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "rounded-full font-semibold")}
          >
            {registeringOutbound ? (
              <>
                <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden />
                Registering…
              </>
            ) : outboundRegistered ? (
              <>
                <Check className="mr-1.5 inline h-4 w-4" aria-hidden />
                Registered
              </>
            ) : (
              <>
                <PhoneOutgoing className="mr-1.5 inline h-4 w-4" aria-hidden />
                Register outbound
              </>
            )}
          </button>
        </div>
        {outboundRegistered ? (
          <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p>
              Registered <span className="font-mono font-semibold">{outboundRegistered.e164}</span> with Vapi.
            </p>
            <p>
              Now set this env var on Vercel, then redeploy:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] text-emerald-950">
{`SOLVIO_VAPI_OUTBOUND_PHONE_NUMBER_ID=${outboundRegistered.id}`}
            </pre>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#ebe7f7] pt-4">
          <button
            type="button"
            disabled={listingNumbers}
            onClick={handleListNumbers}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full border-[#ebe7f7] font-semibold")}
          >
            {listingNumbers ? (
              <>
                <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "List Vapi numbers"
            )}
          </button>
          <p className="text-xs text-[#64748b]">Diagnose what&apos;s actually registered on Vapi.</p>
        </div>
        {vapiNumbers ? (
          vapiNumbers.length ? (
            <ul className="mt-3 space-y-2 text-[12px]">
              {vapiNumbers.map((n) => (
                <li key={n.id} className="rounded-lg border border-[#ebe7f7] bg-white px-3 py-2">
                  <p className="font-mono font-semibold text-[#0f172a]">{n.number ?? "(no number)"}</p>
                  <p className="font-mono text-[#64748b]">{n.id}</p>
                  <p className="text-[#94a3b8]">
                    provider: {n.provider ?? "—"} · name: {n.name ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              No phone numbers registered on this Vapi workspace yet. Click &ldquo;Register outbound&rdquo; above first.
            </p>
          )
        ) : null}
      </div>

      <div className="rounded-[22px] border border-[#ebe7f7] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-[#0f172a]" htmlFor="admin-country">
              Country
            </label>
            <select
              id="admin-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={pending}
              className="h-11 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            >
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-[#0f172a]" htmlFor="admin-areacode">
              Area code (optional)
            </label>
            <input
              id="admin-areacode"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              disabled={pending}
              placeholder="e.g. 020"
              className="h-11 w-32 rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-3 text-[15px] outline-none focus:border-[#c4b5fd] focus:ring-2 focus:ring-[#7c3aed]/25"
            />
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={handleSearch}
            className={cn(
              buttonVariants({ variant: "default" }),
              "rounded-full font-semibold shadow-md shadow-[#7c3aed]/20",
            )}
          >
            {pending && !buyingNumber ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" aria-hidden />
                Searching…
              </>
            ) : (
              <>
                <Search className="mr-2 inline h-4 w-4" aria-hidden />
                Search Twilio
              </>
            )}
          </button>
        </div>
      </div>

      {bought ? (
        <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Check className="h-5 w-5 text-emerald-700" aria-hidden />
            <p className="font-semibold text-emerald-950">Number claimed</p>
          </div>
          <p className="mt-3 font-mono text-[15px] font-semibold text-emerald-950">{bought.phoneNumber}</p>
          <p className="mt-2 text-xs text-emerald-900">
            SID: <code className="font-mono">{bought.sid}</code>
          </p>
          <p className="mt-3 text-sm text-emerald-900">
            Now set <code className="font-mono">SOLVIO_TWILIO_FROM_NUMBER</code> on Vercel to{" "}
            <span className="font-mono font-semibold">{bought.phoneNumber}</span> and redeploy. Booking SMS will start
            sending from this number.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</p>
      ) : null}

      {results.length ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#0f172a]">
            {results.length} number{results.length === 1 ? "" : "s"} available
          </p>
          <ul className="space-y-2">
            {results.map((n) => {
              const isBuying = buyingNumber === n.phoneNumber;
              return (
                <li
                  key={n.phoneNumber}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#ebe7f7] bg-white px-4 py-3"
                >
                  <Phone className="h-4 w-4 text-[#7c3aed]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[15px] font-semibold text-[#0f172a]">{n.phoneNumber}</p>
                    <p className="text-xs text-[#64748b]">
                      {[n.locality, n.region, n.isoCountry].filter(Boolean).join(", ")}
                      {" · "}
                      {[
                        n.capabilities.voice ? "voice" : null,
                        n.capabilities.sms ? "SMS" : null,
                        n.capabilities.mms ? "MMS" : null,
                      ]
                        .filter(Boolean)
                        .join(" + ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleBuy(n.phoneNumber)}
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                      "rounded-full font-semibold",
                    )}
                  >
                    {isBuying ? (
                      <>
                        <Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" aria-hidden />
                        Claiming…
                      </>
                    ) : (
                      "Claim"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : searched && !error && !bought ? (
        <p className="rounded-xl border border-[#ebe7f7] bg-[#fafbff] px-4 py-3 text-sm text-[#64748b]">
          No matching numbers in that country/area code. Try a different area or country.
        </p>
      ) : null}
    </div>
  );
}
