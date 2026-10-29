"use client";

import { ExternalLink, Loader2, Search } from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";

import {
  findHoldedContactsForPartnerAction,
  linkHoldedContactAction,
  unlinkHoldedContactAction,
  type HoldedPartnerLinkResult,
} from "@/app/dashboard/show-ops/actions-holded";
import { holdedContactUrl, type HoldedContactCandidate, type RankedHoldedContact } from "@/lib/show-ops/holded";

function ContactLine({ c }: { c: HoldedContactCandidate }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium text-slate-900">
        {c.tradeName && c.tradeName !== c.name ? `${c.tradeName} · ` : ""}
        {c.name}
      </span>
      <span className="block truncate text-[11px] text-slate-500">
        {[c.nif ? `NIF ${c.nif}` : "no NIF", c.city, ...c.tags.map((t) => `#${t}`)].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

/** Links made on this page since it loaded, so a card closed and reopened shows them, not the page's first read. */
const linkedThisVisit = new Map<string, string | null>();

/**
 * Which Holded contact this partner's invoices land on. Joel's Holded keeps one contact per island for the big
 * agents (and one per agent code for First Excursions), so the office picks the right one here once, instead of
 * the send stopping to ask. Lives inside the partners form, so it uses buttons, never a nested form.
 */
export function PartnerHoldedLink({ supplierId, linkedId: initialLinkedId }: { supplierId: string; linkedId: string | null }) {
  const [linkedId, setLinkedId] = useState(linkedThisVisit.has(supplierId) ? (linkedThisVisit.get(supplierId) ?? null) : initialLinkedId);
  const [linked, setLinked] = useState<HoldedContactCandidate | null>(null);
  const [candidates, setCandidates] = useState<RankedHoldedContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(kind: string, call: () => Promise<HoldedPartnerLinkResult>, done?: (r: Extract<HoldedPartnerLinkResult, { ok: true }>) => void) {
    setBusy(kind);
    setNotice(null);
    startTransition(() => {
      void call()
        .then((r) => {
          if (!r.ok) return setNotice({ ok: false, text: r.message });
          linkedThisVisit.set(supplierId, r.linkedId);
          setLinkedId(r.linkedId);
          setLinked(r.linked);
          if (r.candidates) setCandidates(r.candidates);
          if (r.linkedMissing) setNotice({ ok: false, text: "The linked contact is no longer in Holded. Pick another, or unlink to let the next send look it up." });
          else if (r.note) setNotice({ ok: false, text: r.note });
          done?.(r);
        })
        .catch(() => setNotice({ ok: false, text: "Holded did not answer. Please try again." }))
        .finally(() => setBusy(null));
    });
  }

  const find = () => run("find", () => findHoldedContactsForPartnerAction(supplierId, query));
  const link = (id: string) =>
    run(`link:${id}`, () => linkHoldedContactAction(supplierId, id), (r) => {
      if (!r.note) setNotice({ ok: true, text: "Linked. Invoices for this partner now go to this Holded contact." });
    });
  const unlink = () =>
    run("unlink", () => unlinkHoldedContactAction(supplierId), () =>
      setNotice({ ok: true, text: "Unlinked. The next send looks the contact up by NIF, then exact name, and stops if more than one could fit." }),
    );

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    find();
  }

  const btn = "flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs sm:col-span-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-700">Holded contact</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${linkedId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {linkedId ? "Linked" : "Not linked"}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={find} disabled={busy !== null} className={btn}>
            {busy === "find" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Search className="h-3.5 w-3.5" aria-hidden />}
            {candidates ? "Search again" : linkedId ? "Check or change" : "Find in Holded"}
          </button>
          {linkedId ? (
            <a href={holdedContactUrl(linkedId)} target="_blank" rel="noreferrer" className={btn}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open in Holded
            </a>
          ) : null}
          {linkedId ? (
            <button type="button" onClick={unlink} disabled={busy !== null} className={`${btn} text-rose-700`}>
              {busy === "unlink" ? "Unlinking" : "Unlink"}
            </button>
          ) : null}
        </span>
      </div>
      {linked ? (
        <div className="rounded-lg bg-emerald-50/60 px-2.5 py-1.5 ring-1 ring-emerald-100">
          <ContactLine c={linked} />
        </div>
      ) : null}
      <p className="text-slate-500">
        Invoices for this partner go to this contact in Holded. Not linked: the first send looks it up by NIF, then exact name, and stops
        if more than one contact could fit.
      </p>
      {candidates ? (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search Holded: name, NIF, #TFS, city"
              aria-label="Search Holded contacts"
              className="w-full rounded-lg border px-2 py-1.5 text-sm"
            />
          </div>
          {candidates.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <ContactLine c={c} />
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    {c.suggested ? (
                      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700" title="The contact a send would use today">
                        Send uses this
                      </span>
                    ) : c.nifMatches ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Same NIF</span>
                    ) : null}
                    {c.id === linkedId ? (
                      <span className="text-[11px] font-semibold text-emerald-700">Linked</span>
                    ) : (
                      <button type="button" onClick={() => link(c.id)} disabled={busy !== null} className={btn}>
                        {busy === `link:${c.id}` ? "Linking" : "Link"}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500">No Holded contact matches. Try part of the name, the NIF, or an island tag like #TFS.</p>
          )}
        </div>
      ) : null}
      {notice ? (
        <p className={notice.ok ? "text-emerald-700" : "text-rose-700"} role="status">
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
