"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addBookingPaymentAction } from "@/app/dashboard/show-ops/actions";
import { formatShowOpsMoney, showOpsCurrencySymbol } from "@/lib/show-ops/calc";
import type { ShowOpsCurrency } from "@/lib/show-ops/types";
import { cn } from "@/lib/utils";

/**
 * "Add payment" button + window. The amount is typed in the booking's own
 * currency (€ or £, from its island); the guest paid by cash, card or direct. Saving
 * records one payment and the outstanding balance drops by that amount.
 */
export function AddPaymentButton({
  bookingId,
  bookingRef,
  outstanding,
  currency,
  className,
}: {
  bookingId: string;
  bookingRef: string;
  outstanding: number;
  currency: ShowOpsCurrency;
  className?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "direct" | "">("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const symbol = showOpsCurrencySymbol(currency);
  const code = currency.toUpperCase();

  function open() {
    setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
    setMethod("");
    setError("");
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cn(
          "inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700",
          className,
        )}
      >
        Add payment
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`add-payment-${bookingId}`}
        className="w-[min(92vw,24rem)] rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/40"
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            const value = Number(amount);
            if (!Number.isFinite(value) || value <= 0) {
              setError("Type an amount above zero.");
              return;
            }
            if (value - outstanding > 0.009) {
              setError(`That is more than the outstanding ${formatShowOpsMoney(outstanding, currency)}.`);
              return;
            }
            if (!method) {
              setError("Choose cash, card or direct.");
              return;
            }
            const fd = new FormData();
            fd.set("booking_id", bookingId);
            fd.set("amount", value.toFixed(2));
            fd.set("method", method);
            startTransition(async () => {
              const res = await addBookingPaymentAction(fd);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              close();
              router.refresh();
            });
          }}
        >
          <div>
            <h2 id={`add-payment-${bookingId}`} className="text-base font-semibold text-slate-900">
              Add payment · {bookingRef}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Outstanding{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {formatShowOpsMoney(outstanding, currency)}
              </span>
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Amount paid ({code})
            <span className="mt-1 flex items-center rounded-lg border px-3 focus-within:ring-2 focus-within:ring-emerald-500">
              <span className="text-slate-500">{symbol}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                max={outstanding.toFixed(2)}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent px-2 py-2 tabular-nums outline-none"
                autoFocus
              />
            </span>
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Paid by</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {(["cash", "card", "direct"] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ring-1",
                    method === m ? "bg-emerald-50 text-emerald-900 ring-emerald-500" : "bg-white text-slate-700 ring-slate-300",
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="sr-only"
                  />
                  {m === "cash" ? "Cash" : m === "card" ? "Card" : "Direct (PayPal / Stripe)"}
                </label>
              ))}
            </div>
          </fieldset>
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Add payment"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
