"use client";

import { useFormStatus } from "react-dom";

import { runLeadSearch } from "./actions";
import { NumberInput } from "@/components/ui/number-input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-xl bg-[#7c3aed] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6d28d9] disabled:opacity-60"
    >
      {pending ? "Searching…" : "Find leads"}
    </button>
  );
}

export function LeadSearchForm() {
  return (
    <form
      action={async (fd) => {
        await runLeadSearch(fd);
      }}
      className="rounded-2xl border border-[#ebe7f7] bg-white p-5 shadow-sm md:p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Niche</span>
          <input
            name="query"
            required
            placeholder="e.g. tapas bar, boutique hotel, hair salon"
            className="mt-1.5 w-full rounded-xl border border-[#e2e0f0] bg-[#fafbff] px-3.5 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#7c3aed]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">Location</span>
          <input
            name="location"
            required
            placeholder="e.g. Valencia, Spain"
            className="mt-1.5 w-full rounded-xl border border-[#e2e0f0] bg-[#fafbff] px-3.5 py-2.5 text-sm text-[#0f172a] outline-none focus:border-[#7c3aed]"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="inline-flex items-center gap-2 text-sm text-[#475569]">
          <input type="checkbox" name="onlyNoWebsite" className="size-4 accent-[#7c3aed]" />
          Only businesses with no website
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[#475569]">
          <input type="checkbox" name="requirePhone" defaultChecked className="size-4 accent-[#7c3aed]" />
          Must have a phone number
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[#475569]">
          Min rating
          <NumberInput
            name="minRating"
            min={0}
            max={5}
            placeholder="0"
            className="w-20 rounded-lg border border-[#e2e0f0] bg-[#fafbff] px-2 py-1 text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-[#475569]">
          Limit
          <NumberInput
            name="limit"
            min={1}
            max={200}
            defaultValue={50}
            className="w-20 rounded-lg border border-[#e2e0f0] bg-[#fafbff] px-2 py-1 text-sm"
          />
        </label>
        <div className="ml-auto">
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
