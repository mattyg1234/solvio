"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { promoteLeads } from "./actions";

export type DiscoveredLeadRow = {
  id: string;
  business_name: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  city: string | null;
  rating: number | null;
  review_count: number | null;
  has_website: boolean;
  fit_score: number;
  fit_signals: { key: string; label: string; weight: number }[];
  status: "new" | "promoted" | "dismissed";
};

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-700";
  if (score >= 45) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function PromoteButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || count === 0}
      className="inline-flex items-center justify-center rounded-xl bg-[#7c3aed] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6d28d9] disabled:opacity-50"
    >
      {pending ? "Adding…" : `Add ${count || ""} to campaign`}
    </button>
  );
}

export function ResultsTable({
  leads,
  campaigns,
  searchLabel,
}: {
  leads: DiscoveredLeadRow[];
  campaigns: { id: string; name: string }[];
  searchLabel: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const promotable = useMemo(() => leads.filter((l) => l.status === "new" && l.phone), [leads]);

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
      prev.size === promotable.length ? new Set() : new Set(promotable.map((l) => l.id)),
    );
  }

  if (leads.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-[#d9d3f3] bg-white p-10 text-center">
        <p className="text-sm text-[#64748b]">No leads for this search yet. Run a search above to populate it.</p>
      </section>
    );
  }

  return (
    <form
      action={async (fd) => {
        await promoteLeads(fd);
        setSelected(new Set());
      }}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#0f172a]">
          Results · <span className="text-[#64748b]">{searchLabel}</span>{" "}
          <span className="text-xs font-normal text-[#94a3b8]">({leads.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            name="campaignId"
            required
            defaultValue=""
            className="rounded-xl border border-[#e2e0f0] bg-white px-3 py-2 text-sm text-[#0f172a]"
          >
            <option value="" disabled>
              {campaigns.length ? "Choose campaign…" : "No campaigns yet"}
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <PromoteButton count={selected.size} />
        </div>
      </div>

      {[...selected].map((id) => (
        <input key={id} type="hidden" name="leadIds" value={id} />
      ))}

      <div className="overflow-x-auto rounded-2xl border border-[#ebe7f7] bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[#fafbff] text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
            <tr>
              <th className="px-3 py-3 text-left">
                <input
                  type="checkbox"
                  className="size-4 accent-[#7c3aed]"
                  checked={promotable.length > 0 && selected.size === promotable.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-3 text-left">Business</th>
              <th className="px-3 py-3 text-left">Phone</th>
              <th className="px-3 py-3 text-left">Web</th>
              <th className="px-3 py-3 text-left">Rating</th>
              <th className="px-3 py-3 text-left">Why a fit</th>
              <th className="px-3 py-3 text-right">Fit</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const isPromoted = l.status === "promoted";
              const isDismissed = l.status === "dismissed";
              const canSelect = l.status === "new" && Boolean(l.phone);
              return (
                <tr
                  key={l.id}
                  className={`border-t border-[#f1eefc] ${isDismissed ? "opacity-40" : ""}`}
                >
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#7c3aed] disabled:opacity-30"
                      checked={selected.has(l.id)}
                      onChange={() => toggle(l.id)}
                      disabled={!canSelect}
                      aria-label={`Select ${l.business_name}`}
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-[#0f172a]">{l.business_name}</div>
                    <div className="text-xs text-[#94a3b8]">
                      {[l.category, l.city].filter(Boolean).join(" · ")}
                    </div>
                    {isPromoted && (
                      <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">
                        in campaign
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top font-mono text-xs text-[#475569]">
                    {l.phone ?? <span className="text-[#cbd5e1]">none</span>}
                  </td>
                  <td className="px-3 py-3 align-top text-xs">
                    {l.website ? (
                      <a
                        href={l.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#7c3aed] underline"
                      >
                        site
                      </a>
                    ) : (
                      <span className="font-semibold text-rose-500">none</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-[#475569]">
                    {l.rating != null ? `${l.rating}★` : "—"}
                    {l.review_count != null && (
                      <span className="text-[#94a3b8]"> ({l.review_count})</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {l.fit_signals.map((s) => (
                        <span
                          key={s.key}
                          className="rounded bg-[#f5f3ff] px-1.5 py-0.5 text-[10px] font-medium text-[#6d28d9]"
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${scoreColor(l.fit_score)}`}
                    >
                      {l.fit_score}
                    </span>
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
