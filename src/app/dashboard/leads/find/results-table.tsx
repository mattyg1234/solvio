"use client";

import { useActionState, useEffect, useState } from "react";

import { addLeadsToCallList, type FinderState } from "./actions";

export type FoundLead = {
  id: string;
  business_name: string;
  category: string | null;
  phone: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  has_website: boolean;
  fit_score: number;
  status: string;
};

export function FoundLeadsTable({ leads }: { leads: FoundLead[] }) {
  const selectable = leads.filter((l) => l.status === "new" && l.phone);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<FinderState | undefined, FormData>(
    addLeadsToCallList,
    undefined,
  );

  // Clear the selection once an add succeeds.
  useEffect(() => {
    if (state?.ok) setSelected(new Set());
  }, [state]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map((l) => l.id)),
    );
  }

  if (!leads.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[#e2e0f0] bg-white p-8 text-center text-sm text-[#94a3b8]">
        No leads yet — run a search above to discover businesses to call.
      </p>
    );
  }

  return (
    <form action={formAction}>
      {Array.from(selected).map((id) => (
        <input key={id} type="hidden" name="leadIds" value={id} />
      ))}

      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-[#475569]">
          {leads.length} found · {selectable.length} ready to call
          {state ? (
            <span className={`ml-2 font-medium ${state.ok ? "text-[#15803d]" : "text-[#dc2626]"}`}>
              {state.message}
            </span>
          ) : null}
        </p>
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#16a34a] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#15803d] disabled:opacity-50"
        >
          {pending
            ? "Adding…"
            : selected.size > 0
              ? `Add ${selected.size} to call list`
              : "Select leads to add"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#ebe7f7] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#faf9ff] text-xs uppercase tracking-[0.12em] text-[#94a3b8]">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-[#7c3aed]"
                  checked={selectable.length > 0 && selected.size === selectable.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Fit</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1eefb]">
            {leads.map((l) => {
              const canPick = l.status === "new" && !!l.phone;
              return (
                <tr key={l.id} className={l.status === "promoted" ? "opacity-60" : ""}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#7c3aed]"
                      disabled={!canPick}
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#0f172a]">{l.business_name}</div>
                    <div className="text-xs text-[#94a3b8]">
                      {[l.category, l.city].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#475569]">{l.phone ?? "no number"}</td>
                  <td className="px-4 py-3 text-[#475569]">
                    {l.rating != null ? `${l.rating.toFixed(1)}★` : "—"}
                    {l.review_count != null ? ` (${l.review_count})` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        l.fit_score >= 75
                          ? "bg-[#dcfce7] text-[#15803d]"
                          : l.fit_score >= 50
                            ? "bg-[#fef9c3] text-[#a16207]"
                            : "bg-[#f1f5f9] text-[#64748b]"
                      }`}
                    >
                      {l.fit_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#94a3b8]">
                    {l.status === "promoted" ? "On call list" : canPick ? "New" : "No phone"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
