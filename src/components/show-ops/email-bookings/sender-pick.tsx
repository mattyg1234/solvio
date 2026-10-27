"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { SHOW_OPS_GHOST_BTN, SHOW_OPS_PRIMARY_BTN } from "@/components/show-ops/show-ops-page-header";
import { cleanSender, senderEntry, withSender } from "@/lib/show-ops/email-bookings/sellers";
import type { SellerFound } from "@/lib/show-ops/email-bookings/types";

import { relativeTime } from "./relative-time";

const INPUT = "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--show-ops-primary,#7c3aed)]";

/** What saveEmailSendersAction takes: a tick per sender, and the name of any sender the office added. */
export function senderChoices(sellers: SellerFound[]) {
  return sellers.map((s) => ({ key: s.key, track: s.track, ...(s.custom ? { name: s.name } : {}) }));
}

/**
 * For booking emails the Hub doesn't know to look for: MHT's own website shop
 * (support@musichalltavern.com), a hotel desk, a local agent. Takes a whole address or a domain.
 */
export function AddSender({ onAdd, compact = false }: { onAdd: (s: SellerFound) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sender, setSender] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const clean = cleanSender(sender);
    if (!clean) return setError("Type an email address (support@musichalltavern.com) or a website (tiqets.com).");
    onAdd(senderEntry(name, clean));
    setName("");
    setSender("");
    setError(null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start text-sm font-semibold hover:underline"
        style={{ color: "var(--show-ops-primary,#7c3aed)" }}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add a sender we missed
      </button>
    );
  }
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 p-3">
      {!compact && (
        <p className="text-xs text-slate-500">
          The website shop&rsquo;s order emails, a hotel desk or a local agent. Every email from that address (or from anyone at that website) is read as a
          possible booking.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={enter} placeholder="Name, e.g. MHT website" aria-label="Sender name" className={INPUT} />
        <input
          value={sender}
          onChange={(e) => (setSender(e.target.value), setError(null))}
          onKeyDown={enter}
          placeholder="support@musichalltavern.com or tiqets.com"
          aria-label="Email address or website"
          inputMode="email"
          className={INPUT}
        />
        <div className="flex gap-1">
          <button type="button" onClick={add} className={SHOW_OPS_PRIMARY_BTN}>
            Add
          </button>
          <button type="button" onClick={() => (setOpen(false), setError(null))} className={SHOW_OPS_GHOST_BTN}>
            Cancel
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

function SenderRow({ s, onSellers }: { s: SellerFound; onSellers: (update: (all: SellerFound[]) => SellerFound[]) => void }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={s.track}
          onChange={(e) => onSellers((all) => all.map((x) => (x.key === s.key ? { ...x, track: e.target.checked } : x)))}
          className="h-4 w-4 accent-[var(--show-ops-primary,#7c3aed)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">
            {s.name}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {s.domain}
            {s.found > 0 ? ` · last booking ${relativeTime(s.lastSeen)}` : s.custom ? " · every email from here is read" : " · every email from this website is read"}
            {s.other ? ` · ${s.other} other email${s.other === 1 ? "" : "s"} (adverts, account mail) ignored` : ""}
          </span>
          {s.examples?.length ? (
            <span className="mt-1 block truncate text-xs italic text-slate-600" title={s.examples.join("\n")}>
              e.g. &ldquo;{s.examples[0]}&rdquo;
            </span>
          ) : null}
        </span>
      </label>
      <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
        {s.found}
        <span className="block text-xs font-normal text-slate-500">{s.suggested ? "look like bookings" : "bookings"}</span>
      </span>
      {!s.suggested && (
        <button
          type="button"
          onClick={() => onSellers((all) => all.filter((x) => x.key !== s.key))}
          aria-label={`Remove ${s.name}`}
          className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

/** The senders found in the inbox, with a tick for each one to track. */
export function SenderPick({
  address,
  sellers,
  skipped,
  onSellers,
}: {
  address: string;
  sellers: SellerFound[];
  skipped: number;
  onSellers: (update: (all: SellerFound[]) => SellerFound[]) => void;
}) {
  const main = sellers.filter((s) => !s.suggested);
  const suggested = sellers.filter((s) => s.suggested);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold text-slate-900">
          {main.length ? `${main.length} booking sender${main.length === 1 ? "" : "s"} in ${address}` : `No known booking sites have emailed ${address} in the last 90 days`}
        </p>
        <p className="text-sm text-slate-500">
          Tick the ones to track. Their booking emails land in To check for the office; {skipped.toLocaleString("en-GB")} other emails were skipped and not stored.
        </p>
      </div>
      {main.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {main.map((s) => (
            <SenderRow key={s.key} s={s} onSellers={onSellers} />
          ))}
        </ul>
      )}
      {suggested.length > 0 && (
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-900">Other senders that look like bookings</p>
            <p className="text-xs text-slate-500">The Hub doesn&rsquo;t know these. Tick one if its emails are bookings, like the website shop&rsquo;s order emails.</p>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-dashed border-violet-300">
            {suggested.map((s) => (
              <SenderRow key={s.key} s={s} onSellers={onSellers} />
            ))}
          </ul>
        </div>
      )}
      <AddSender onAdd={(s) => onSellers((all) => withSender(all, s))} />
    </div>
  );
}
