"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Phone, Search } from "lucide-react";

import { buyTwilioNumberAction, searchTwilioNumbersAction } from "@/app/admin/twilio/actions";
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
