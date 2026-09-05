"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { inviteSellerColleagueAction } from "@/app/dashboard/show-ops/actions";

export function SellerColleagueInviteForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    setPending(true);
    const form = e.currentTarget;
    try {
      const result = await inviteSellerColleagueAction(new FormData(form));
      if (!result.ok) {
        setErr(result.message);
        return;
      }
      form.reset();
      setOk(true);
      router.refresh();
    } catch {
      setErr("We could not send the invitation. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm">
          Seller email
          <input
            name="email"
            type="email"
            required
            placeholder="front.desk@agency.com"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[var(--show-ops-primary,#0f766e)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send invitation"}
        </button>
      </div>
      {err ? (
        <p role="alert" className="text-sm text-rose-700">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p role="status" className="text-sm text-emerald-800">
          Invitation email sent with a one-time sign-in link for your
          organisation.
        </p>
      ) : null}
    </form>
  );
}
